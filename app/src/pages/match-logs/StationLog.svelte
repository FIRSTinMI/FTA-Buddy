<script lang="ts">
	import { Alert, Button, Label, Modal, MultiSelect, type SelectOptionType } from "flowbite-svelte";
	import { json2csv } from "json-2-csv";
	import type { ComponentProps } from "svelte";
	import QrCode from "svelte-qrcode";
	import { MCS_LOOKUP_TABLE } from "../../../../shared/constants";
	import { formatTimeNoAgo, formatTimeShortNoAgoSeconds } from "../../../../shared/formatTime";
	import type { FMSLogFrame, ROBOT } from "../../../../shared/types";
	import LogGraph from "../../components/LogGraph.svelte";
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
	let actualStation: ROBOT;

	let log: FMSLogFrame[];
	let team: number;
	let logGraph: LogGraph;

	let match: Awaited<ReturnType<typeof trpc.match.getStationMatch.query>>;
	let matchPromise: Promise<any>;

	if ($userStore.eventToken) {
		matchPromise = trpc.match.getStationMatch.query({ id: matchid, station: station });
	} else {
		matchPromise = trpc.match.getPublicMatch.query({ id: matchid, sharecode: station });
	}

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

	let columns: SelectOptionType<keyof FMSLogFrame>[] = [
		{ name: "DS", value: "dsLinkActive" },
		{ name: "Radio", value: "radioLink" },
		{ name: "RIO", value: "rioLink" },
		{ name: "Code", value: "linkActive" },
		{ name: "Status", value: "enabled" },
		{ name: "Battery", value: "battery" },
		{ name: "Ping", value: "averageTripTime" },
		{ name: "BWU", value: "dataRateTotal" },
		{ name: "Lost Pkts", value: "lostPackets" },
		{ name: "Sent Pkts", value: "sentPackets" },
		{ name: "Signal", value: "signal" },
		{ name: "Noise", value: "noise" },
		{ name: "SNR", value: "snr" },
		{ name: "TxRate", value: "txRate" },
		{ name: "TxMCS", value: "txMCS" },
		{ name: "RxRate", value: "rxRate" },
		{ name: "RxMCS", value: "rxMCS" },
	];

	let selectedColumns: (keyof FMSLogFrame)[] = [
		"dsLinkActive",
		"radioLink",
		"rioLink",
		"linkActive",
		"enabled",
		"battery",
		"averageTripTime",
		"dataRateTotal",
	];

	let shareid: string;
	let shareOpen = false;

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
			Log published for 72 hours. Share this log only with team #{team} or other volunteers.
		</p>
		<div class="max-w-48 mx-auto">
			<QrCode value={`https://ftabuddy.com/logs/${matchid}/${shareid}`} padding={12} />
		</div>
		<Button onclick={() => (shareOpen = false)} class="mt-2">Close</Button>
	</div>
</Modal>

<div class="container h-full overflow-y-auto">
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

			<LogGraph bind:this={logGraph} {log} />

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

			<Label class="text-left">
				Select Columns
				<MultiSelect items={columns} bind:value={selectedColumns} size="sm" class="mt-2" />
			</Label>

			<div class="overflow-x-auto text-center w-full">
				<table class="relative overflow-x-auto text-sm text-left text-gray-500 dark:text-gray-400">
					<thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-black dark:text-white">
						<tr>
							<th class="px-4 py-3 sticky bg-black left-0">Time</th>
							{#each selectedColumns as col}
								<th class="px-4 py-3">{columns.find((c) => c.value === col)?.name}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#if match}
							{#each log as frame}
								<tr
									class="border-b text-center dark:border-gray-700 odd:bg-white odd:dark:bg-gray-900 even:bg-gray-50 even:dark:bg-gray-800"
								>
									<td class="px-4 py-2 text-white text-center sticky left-0 bg-gray-40 dark:bg-black"
										>{frame.matchTime}</td
									>
									{#each selectedColumns as col}
										{#if col === "enabled"}
											{#if frame.eStopPressed}
												<td class="px-4 py-2 bg-red-500 text-white">E</td>
											{:else if frame.aStopPressed}
												<td class="px-4 py-2 bg-orange-500 text-white">A</td>
											{:else if !frame.enabled}
												<td class="px-4 py-2 bg-red-500 text-white">N</td>
											{:else if frame.auto}
												<td class="px-4 py-2">A</td>
											{:else}
												<td class="px-4 py-2">T</td>
											{/if}
										{:else if col === "battery"}
											<td
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
											<td class="px-4 py-2"
												>{typeof frame[col] === "number"
													? frame[col].toFixed(0)
													: frame[col]}</td
											>
										{:else if ["dataRateTotal", "txRate", "rxRate"].includes(col)}
											<td class="px-4 py-2"
												>{typeof frame[col] === "number"
													? frame[col].toFixed(2)
													: frame[col]}</td
											>
										{:else}
											<td class="px-4 py-2{frame[col] ? '' : ' bg-red-500 text-white'}"
												>{frame[col] ? "Y" : "N"}</td
											>
										{/if}
									{/each}
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		{/await}
	</div>
</div>
