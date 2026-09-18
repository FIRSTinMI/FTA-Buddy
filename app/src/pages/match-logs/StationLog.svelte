<script lang="ts">
	import { Alert, Button, Label, Modal } from "flowbite-svelte";
	import { json2csv } from "json-2-csv";
	import type { ComponentProps } from "svelte";
	import QrCode from "svelte-qrcode";
	import { MCS_LOOKUP_TABLE } from "../../../../shared/constants";
	import { formatTimeNoAgo, formatTimeShortNoAgoSeconds } from "../../../../shared/formatTime";
	import type { FMSLogFrame, ROBOT } from "../../../../shared/types";
	import LogGraph from "../../components/LogGraph.svelte";
	import TeamLogEvents from "../../components/uploads/TeamLogEvents.svelte";
	import SeriesSelect, { type SeriesItem } from "../../components/uploads/SeriesSelect.svelte";
	import type { OverlaySeries } from "../../components/LogGraph.svelte";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { navigate, route } from "../../router";
	import { userStore } from "../../stores/user";
	import { decompressStationLog } from "../../util/log-compression";
	import { track } from "../../util/telemetry";

	track("station_log_viewed");
	import { displayTeam } from "../../util/team-name";
	import Icon from "@iconify/svelte";

	const { matchid, station } = route.getParams("/logs/:matchid/:station");
	let actualStation: ROBOT = $state(undefined as any);

	let log: FMSLogFrame[] = $state(undefined as any);
	let team: number = $state(undefined as any);
	let logGraph: LogGraph = $state(undefined as any);

	let match: Awaited<ReturnType<typeof trpc.match.getStationMatch.query>> = $state(undefined as any);

	const matchPromise: Promise<any> = $userStore.eventToken
		? trpc.match.getStationMatch.query({ id: matchid, station: station })
		: trpc.match.getPublicMatch.query({ id: matchid, sharecode: station });

	matchPromise.then((m) => {
		match = m;
		log = decompressStationLog(m.log);
		for (let frame of log) {
			if (!frame.txMCS && frame.txRate) frame.txMCS = MCS_LOOKUP_TABLE[frame.txRate];
			if (!frame.rxMCS && frame.rxRate) frame.rxMCS = MCS_LOOKUP_TABLE[frame.rxRate];
		}
		team = m.team;
		actualStation = m.station;
	});

	function back() {
		if (window.history.length <= 1) {
			navigate("/logs");
		} else {
			window.history.back();
		}
	}

	let view: "graph" | "table" = "graph";

	/** Field monitor columns, keyed apart from the uploaded series in one list. */
	const FMS_COLUMNS: { field: keyof FMSLogFrame; name: string }[] = [
		{ field: "dsLinkActive", name: "DS" },
		{ field: "radioLink", name: "Radio" },
		{ field: "rioLink", name: "RIO" },
		{ field: "linkActive", name: "Code" },
		{ field: "enabled", name: "Status" },
		{ field: "battery", name: "Battery" },
		{ field: "averageTripTime", name: "Ping" },
		{ field: "dataRateTotal", name: "BWU" },
		{ field: "lostPackets", name: "Lost Pkts" },
		{ field: "sentPackets", name: "Sent Pkts" },
		{ field: "signal", name: "Signal" },
		{ field: "noise", name: "Noise" },
		{ field: "snr", name: "SNR" },
		{ field: "txRate", name: "TxRate" },
		{ field: "txMCS", name: "TxMCS" },
		{ field: "rxRate", name: "RxRate" },
		{ field: "rxMCS", name: "RxMCS" },
	];

	let tableColumns = $state<string[]>([
		"fms:dsLinkActive",
		"fms:radioLink",
		"fms:rioLink",
		"fms:linkActive",
		"fms:enabled",
		"fms:battery",
		"fms:averageTripTime",
		"fms:dataRateTotal",
	]);

	let selectedColumns = $derived(
		tableColumns.filter((key) => key.startsWith("fms:")).map((key) => key.slice(4) as keyof FMSLogFrame),
	);

	let shareid: string = $state(undefined as any);
	let shareOpen = $state(false);

	/**
	 * Logs the team uploaded for this same match. When there are any, the viewer
	 * stops being "what FMS saw" and becomes both sides on one clock.
	 */
	type MatchUpload = Awaited<ReturnType<typeof trpc.uploads.forMatch.query>>[number];
	let teamUploads = $state<MatchUpload[]>([]);
	if ($userStore.eventToken) {
		trpc.uploads.forMatch
			.query({ matchId: matchid })
			.then((rows) => (teamUploads = rows))
			.catch((err) => {
				// Swallowing this made a 400 look like "no uploads for this match",
				// which is indistinguishable from the normal empty case.
				console.error("[station log] could not load team uploads", err);
				teamUploads = [];
			});
	}

	/**
	 * Everything the team uploaded for this match goes onto the one graph above,
	 * not into a second chart. The upload that holds a Driver Station log is the
	 * one worth plotting first, since that is the higher rate record of the same
	 * things the field monitor saw.
	 */
	let primaryUpload = $derived(teamUploads.find((u) => u.hasDsLog) ?? teamUploads[0]);
	let eventsUpload = $derived(teamUploads.find((u) => u.hasEvents));

	let seriesItems = $state<SeriesItem[]>([]);
	let selectedSeries = $state<string[]>([]);
	let overlay = $state<OverlaySeries[]>([]);
	let seriesError = $state<string | null>(null);
	let seriesNotes = $state<string[]>([]);

	/** The moment of a hovered event line, marked on the graph. */
	let markT = $state<number | null>(null);

	/**
	 * The field monitor's battery line comes off when the team's own is plotted.
	 * Both are the same measurement and one of them is 25 times the resolution;
	 * drawn together the slower one just fattens the trace.
	 */
	let hideOnGraph = $derived(selectedSeries.includes("ds.batteryVolts") ? ["Voltage"] : []);

	$effect(() => {
		const upload = primaryUpload;
		if (!upload) return;
		trpc.uploads.seriesOptions
			.query({ id: upload.uploadId })
			.then((options) => {
				// The field monitor series are already legend entries on the graph, so
				// offering them here as well would be two controls for one line.
				seriesItems = options.filter((o) => o.group !== "Field monitor");
				if (selectedSeries.length === 0) {
					// The team's battery trace is the reason to open this page with an
					// upload attached, so it starts on and the field's own is hidden.
					const battery = seriesItems.find((o) => o.key === "ds.batteryVolts");
					if (battery) {
						selectedSeries = [battery.key];
						void loadSeries();
					}
				}
			})
			.catch(() => (seriesItems = []));
	});

	async function loadSeries() {
		const upload = primaryUpload;
		if (!upload) return;
		if (selectedSeries.length === 0) {
			overlay = [];
			seriesNotes = [];
			return;
		}
		seriesError = null;
		try {
			// The window is the match plus 20 s either side. At 50 Hz that is about
			// 10,250 samples, so asking for more than that means nothing is thinned,
			// which is the point of plotting the team's log at all.
			const data = await trpc.uploads.series.query({
				id: upload.uploadId,
				matchId: matchid,
				keys: selectedSeries.slice(0, 8),
				points: 12_000,
			});
			overlay = data.series.map((serie) => ({
				key: serie.key,
				label: serie.label,
				unit: serie.unit,
				axis: serie.axis,
				hz: serie.hz,
				points: serie.points,
			}));
			seriesNotes = data.notes;
		} catch (err) {
			seriesError = err instanceof Error ? err.message : "Unable to load those series";
		}
	}

	/**
	 * The data table, on the union of every sample time.
	 *
	 * A row per field monitor frame threw away 24 of every 25 Driver Station
	 * samples, which is the opposite of the point. So the rows are every instant
	 * any source recorded, and a field monitor value spans the rows it covers.
	 * The rowspan is the readable part: you can see at a glance that one source
	 * ticks twice a second and the other fifty times.
	 */
	let tableSeriesKeys = $derived(tableColumns.filter((key) => !key.startsWith("fms:")));
	let tableOverlay = $state<OverlaySeries[]>([]);

	let frameTimes = $derived(
		match && log
			? log.map((f) => (new Date(f.timeStamp).getTime() - new Date(match.start_time).getTime()) / 1000)
			: [],
	);

	const MAX_TABLE_ROWS = 20_000;

	let tableRows = $derived.by(() => {
		if (!log || frameTimes.length === 0) return [];
		const times = new Set<number>();
		for (const t of frameTimes) times.add(Math.round(t * 1000));
		for (const serie of tableOverlay) {
			for (const point of serie.points) if (point.v !== null) times.add(Math.round(point.t * 1000));
		}
		const sorted = [...times].sort((a, b) => a - b).slice(0, MAX_TABLE_ROWS);

		const cursors = tableOverlay.map(() => 0);
		let frame = 0;
		return sorted.map((ms) => {
			const t = ms / 1000;
			while (frame + 1 < frameTimes.length && frameTimes[frame + 1] <= t + 1e-6) frame += 1;
			const values = tableOverlay.map((serie, col) => {
				const points = serie.points;
				while (cursors[col] < points.length && Math.round(points[cursors[col]].t * 1000) < ms)
					cursors[col] += 1;
				const point = points[cursors[col]];
				return point && Math.round(point.t * 1000) === ms ? point.v : null;
			});
			return { t, frame, v: values };
		});
	});

	/** How many rows each field monitor frame covers, so its cell can span them. */
	let frameSpans = $derived.by(() => {
		const spans = new Map<number, number>();
		for (const row of tableRows) spans.set(row.frame, (spans.get(row.frame) ?? 0) + 1);
		return spans;
	});

	async function loadTableSeries() {
		const upload = primaryUpload;
		if (!upload || tableSeriesKeys.length === 0) {
			tableOverlay = [];
			return;
		}
		try {
			const data = await trpc.uploads.series.query({
				id: upload.uploadId,
				matchId: matchid,
				keys: tableSeriesKeys.slice(0, 16),
				points: 20_000,
			});
			tableOverlay = data.series.map((serie) => ({
				key: serie.key,
				label: serie.label,
				unit: serie.unit,
				axis: serie.axis,
				hz: serie.hz,
				points: serie.points,
			}));
		} catch {
			tableOverlay = [];
		}
	}

	/** Field monitor columns and uploaded series in one searchable list. */
	let tableItems = $derived<SeriesItem[]>([
		...FMS_COLUMNS.map((c) => ({ key: `fms:${c.field}`, label: c.name, group: "Field monitor" })),
		...seriesItems,
	]);

	async function share() {
		if (["blue1", "blue2", "blue3", "red1", "red2", "red3"].includes(station)) {
			let response = await trpc.match.publishMatch.mutate({ id: matchid, station: station as ROBOT, team: team });
			shareid = response.id;
			shareOpen = true;
		} else {
			shareid = station;
			shareOpen = true;
		}
	}

	async function exportLog() {
		const body = json2csv(log, {});
		const url = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
		const a = document.createElement("a");
		a.href = url;
		a.download = `${match.event.toUpperCase()}-${match.level === "None" ? "Test" : match.level}-${match.match_number}-${team}.csv`;
		a.click();
	}

	const analysisEventColors: {
		[key: string]: ComponentProps<typeof Alert>["color"];
	} = {
		"Code disconnect": "purple",
		"RIO disconnect": "yellow",
		"Radio disconnect": "teal",
		"DS disconnect": "teal",
		"Large spike in ping": "blue",
		"High BWU": "teal",
		"Sustained high ping": "blue",
		"Low signal": "indigo",
		Brownout: "red",
	};
</script>

<Modal bind:open={shareOpen} dismissable outsideclose>
	{#snippet header()}
		<h1 class="text-xl">Share Log</h1>
	{/snippet}
	<div class="flex flex-col gap-2">
		<p>
			Log published for 72 hours. Share it only with team #{team} or volunteers at this event, or, with the team's permission,
			the CSA Slack.
		</p>
		<div class="max-w-48 mx-auto">
			<QrCode value={`https://ftabuddy.com/logs/${matchid}/${shareid}`} padding={12} />
		</div>
		<Button onclick={() => (shareOpen = false)} class="mt-2">Close</Button>
	</div>
</Modal>

<div class="h-full overflow-y-auto">
	<div class=" mx-auto p-2 lg:max-w-7xl w-full flex flex-col gap-2 md:gap-4 pb-4">
		<div class="flex justify-between w-full">
			{#if $userStore.eventToken}
				<Button size="sm" color="alternative" onclick={back}>
					<Icon icon="mdi:arrow-left" class="size-4 mr-1" />
				</Button>
				<Button size="sm" color="alternative" onclick={share}>
					<Icon icon="ion:share-outline" class="size-4 mr-1" /> Share
				</Button>
			{/if}
			<Button size="sm" color="alternative" onclick={exportLog}>
				<Icon icon="mynaui:download" class="size-4 mr-1" /> Download
			</Button>
		</div>
		{#await matchPromise}
			<Spinner />
		{:then}
			<div>
				<h1 class="text-xl">
					{match.event.toUpperCase()}
					{match.level === "None" ? "Test" : match.level} Match {match.match_number}/{match.play_number}
				</h1>
				<p>{formatTimeNoAgo(new Date(match.start_time))}</p>
				<h2 class="text-lg">
					{(actualStation.startsWith("blue") ? "Blue " : "Red ") +
						actualStation.charAt(actualStation.length - 1)} -
					{displayTeam(team)}
				</h2>
				<p class="md:hidden text-gray-600 text-sm">View on desktop for more detail</p>
			</div>

			<LogGraph
				bind:this={logGraph}
				{log}
				matchStartMs={new Date(match.start_time).getTime()}
				{overlay}
				{markT}
				hide={hideOnGraph}
			/>

			{#if primaryUpload}
				<div class="flex flex-col gap-1 text-left">
					<div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
						<a class="underline" href={`/uploads/${primaryUpload.uploadId}`}>
							Upload {primaryUpload.code}
						</a>
						{#if primaryUpload.hasDsLog}<span>DS log</span>{/if}
						{#if primaryUpload.hasDataLog}<span>Data log</span>{/if}
						{#if primaryUpload.hasCsv}<span>CSV</span>{/if}
					</div>
					<SeriesSelect
						items={seriesItems}
						bind:value={selectedSeries}
						onchange={() => loadSeries()}
						placeholder="Add series from the team's logs"
					/>
					{#if seriesError}
						<p class="text-sm text-red-600 dark:text-red-400">{seriesError}</p>
					{/if}
					{#each seriesNotes as note}
						<p class="text-xs text-amber-600 dark:text-amber-400">{note}</p>
					{/each}
				</div>
			{/if}

			{#if eventsUpload}
				<TeamLogEvents uploadId={eventsUpload.uploadId} matchId={matchid} onhover={(t) => (markT = t)} />
			{/if}

			<div class="flex flex-col gap-2">
				{#each match.analysis as logEvent}
					<button
						class="w-full text-left cursor-pointer"
						onclick={() => logGraph?.zoomToRange(logEvent.startIndex, logEvent.endIndex)}
					>
						<Alert class="text-left" color={analysisEventColors[logEvent.issue]} border>
							<span class="font-medium">{logEvent.issue}</span>
							Started at {logEvent.startTime}s lasting {formatTimeShortNoAgoSeconds(
								logEvent.duration * 1000,
							)}
						</Alert>
					</button>
				{/each}
			</div>

			<div class="text-left">
				<p class="text-sm font-medium text-gray-900 dark:text-white mb-1">Columns</p>
				<SeriesSelect
					items={tableItems}
					bind:value={tableColumns}
					max={24}
					placeholder="Columns"
					onchange={() => loadTableSeries()}
				/>
			</div>

			<div class="w-full overflow-auto" style="max-height: 70vh">
				<table class="min-w-full text-sm text-left text-gray-500 dark:text-gray-400 mx-auto">
					<thead
						class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-black dark:text-white sticky top-0 z-10"
					>
						<tr>
							<th class="px-4 py-3 sticky bg-gray-50 dark:bg-black left-0 text-gray-700 dark:text-white"
								>Time</th
							>
							{#each selectedColumns as col}
								<th class="px-4 py-3">{FMS_COLUMNS.find((c) => c.field === col)?.name}</th>
							{/each}
							{#each tableOverlay as serie (serie.key)}
								<th class="px-4 py-3">{serie.label}{serie.unit ? ` (${serie.unit})` : ""}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each tableRows as row, rowIndex (row.t)}
							{@const frame = log[row.frame]}
							{@const firstOfFrame = rowIndex === 0 || tableRows[rowIndex - 1].frame !== row.frame}
							<tr
								class="border-b text-center dark:border-gray-700 odd:bg-white odd:dark:bg-gray-900 even:bg-gray-50 even:dark:bg-gray-800"
							>
								<td
									class="px-4 py-2 text-gray-800 dark:text-white text-center sticky left-0 bg-gray-50 dark:bg-gray-900 tabular-nums"
									>{row.t.toFixed(2)}</td
								>
								{#if firstOfFrame}
									{#each selectedColumns as col}
										{@const span = frameSpans.get(row.frame) ?? 1}
										{#if col === "enabled"}
											{#if frame.eStopPressed}
												<td rowspan={span} class="px-4 py-2 bg-red-500 text-white">E</td>
											{:else if frame.aStopPressed}
												<td rowspan={span} class="px-4 py-2 bg-orange-500 text-white">A</td>
											{:else if !frame.enabled}
												<td rowspan={span} class="px-4 py-2 bg-red-500 text-white">N</td>
											{:else if frame.auto}
												<td rowspan={span} class="px-4 py-2">A</td>
											{:else}
												<td rowspan={span} class="px-4 py-2">T</td>
											{/if}
										{:else if col === "battery"}
											<td
												rowspan={span}
												class="px-4 py-2"
												style="background-color: rgba(255,0,0,{frame.battery < 11 &&
												frame.battery > 0
													? (-1.5 * frame.battery ** 2 - 6.6 * frame.battery + 255) / 255
													: 0})"
												>{typeof frame.battery === "number"
													? frame.battery.toFixed(2)
													: frame.battery}</td
											>
										{:else if ["averageTripTime", "lostPackets", "sentPackets", "signal", "noise", "txMCS", "rxMCS"].includes(col)}
											<td rowspan={span} class="px-4 py-2"
												>{typeof frame[col] === "number"
													? frame[col].toFixed(0)
													: frame[col]}</td
											>
										{:else if ["dataRateTotal", "txRate", "rxRate"].includes(col)}
											<td rowspan={span} class="px-4 py-2"
												>{typeof frame[col] === "number"
													? frame[col].toFixed(2)
													: frame[col]}</td
											>
										{:else}
											<td
												rowspan={span}
												class="px-4 py-2{frame[col] ? '' : ' bg-red-500 text-white'}"
												>{frame[col] ? "Y" : "N"}</td
											>
										{/if}
									{/each}
								{/if}
								{#each tableOverlay as serie, col (serie.key)}
									<td class="px-4 py-2 tabular-nums">
										{row.v[col] === null
											? ""
											: serie.axis === "bool"
												? row.v[col]
													? "Y"
													: "N"
												: row.v[col]?.toFixed(2)}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if tableRows.length >= MAX_TABLE_ROWS}
				<p class="text-left text-xs text-gray-500 dark:text-gray-400">
					First {MAX_TABLE_ROWS.toLocaleString()} rows
				</p>
			{/if}
		{/await}
	</div>
</div>
