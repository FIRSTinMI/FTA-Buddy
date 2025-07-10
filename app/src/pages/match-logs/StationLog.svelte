<script lang="ts">
	import {
		Alert,
		Button,
		Label,
		Modal,
		MultiSelect,
		Table,
		TableBody,
		TableBodyCell,
		TableBodyRow,
		TableHead,
		TableHeadCell,
		type SelectOptionType,
	} from "flowbite-svelte";
	import { trpc } from "../../main";
	import { navigate } from "svelte-routing";
	import type { FMSLogFrame, ROBOT } from "../../../../shared/types";
	import LogGraph from "../../components/LogGraph.svelte";
	import QrCode from "svelte-qrcode";
	import { userStore } from "../../stores/user";
	import { formatTimeNoAgo, formatTimeShortNoAgoSeconds } from "../../../../shared/formatTime";
	import Spinner from "../../components/Spinner.svelte";
	import { json2csv } from "json-2-csv";
	import { MCS_LOOKUP_TABLE } from "../../../../shared/constants";
	import { decompressStationLog } from "../../util/log-compression";

	export let matchid: string;
	export let station: ROBOT | string;
	let actualStation: ROBOT;

	let log: FMSLogFrame[];
	let team: number;

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
		if (window.history.state === null) {
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
			let response = await trpc.match.publishMatch.query({ id: matchid, station: station as ROBOT, team: team });
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
		[key: string]:
			| "gray"
			| "red"
			| "yellow"
			| "green"
			| "indigo"
			| "purple"
			| "pink"
			| "blue"
			| "light"
			| "dark"
			| "default"
			| "dropdown"
			| "navbar"
			| "navbarUl"
			| "form"
			| "primary"
			| "orange"
			| "none"
			| undefined;
	} = {
		"Code disconnect": "yellow",
		"RIO disconnect": "red",
		"Radio disconnect": "red",
		"DS disconnect": "red",
		"Large spike in ping": "red",
		"High BWU": "default",
		"Sustained high ping": "yellow",
		"Low signal": "yellow",
		Brownout: "dark",
	};
</script>

<Modal bind:open={shareOpen} dismissable outsideclose>
	<h1 slot="header" class="text-xl">Share Log</h1>
	<div class="flex flex-col gap-2">
		<p>
			Log published for 72 hours. Share this log only with team #{team} or other volunteers.
		</p>
		<div class="max-w-48 mx-auto">
			<QrCode value="https://ftabuddy.com/logs/{matchid}/{shareid}" padding={12} />
		</div>
		<Button on:click={() => (shareOpen = false)} class="mt-2">Close</Button>
	</div>
</Modal>

<div class="container mx-auto p-2 lg:max-w-7xl w-full flex flex-col gap-2 md:gap-4">
	<div class="flex">
		{#if $userStore.eventToken}
			<Button on:click={back} class="w-fit mx-1.5">Back</Button>
			<Button on:click={share} class="w-fit mx-1.5">Share Log</Button>
		{/if}
		<Button on:click={exportLog} class="w-fit mx-1.5">Export CSV</Button>
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
				{(actualStation.startsWith("blue") ? "Blue " : "Red ") + actualStation.charAt(actualStation.length - 1)} - Team #{team}
			</h2>
			<p class="md:hidden text-gray-600 text-sm">View on desktop for more detail</p>
		</div>

		<LogGraph {log} />

		<div class="flex flex-col gap-2">
			{#each match.analysis as logEvent}
				<Alert class="text-left" color={analysisEventColors[logEvent.issue]} border>
					<span class="font-medium">{logEvent.issue}</span>
					Started at {logEvent.startTime}s lasting {formatTimeShortNoAgoSeconds(logEvent.duration * 1000)}
				</Alert>
			{/each}
		</div>

		<Label class="text-left">
			Select Columns
			<MultiSelect items={columns} bind:value={selectedColumns} size="sm" class="mt-2" />
		</Label>

		<Table class="log-table" divClass="relative overflow-auto max-h-logscreen">
			<TableHead class="sticky top-0">
				<TableHeadCell class="px-6 py-4">Time</TableHeadCell>
				{#each selectedColumns as col}
					<TableHeadCell class="px-6 py-4">{columns.find((c) => c.value === col)?.name}</TableHeadCell>
				{/each}
			</TableHead>
			<TableBody>
				{#if match}
					{#each log as frame}
						<TableBodyRow>
							<TableBodyCell>{frame.matchTime}</TableBodyCell>
							{#each selectedColumns as col}
								{#if col === "enabled"}
									{#if frame.eStopPressed}
										<TableBodyCell class="bg-red-500">E</TableBodyCell>
									{:else if frame.aStopPressed}
										<TableBodyCell class="bg-orange-500">A</TableBodyCell>
									{:else if !frame.enabled}
										<TableBodyCell class="bg-red-500">N</TableBodyCell>
									{:else if frame.auto}
										<TableBodyCell>A</TableBodyCell>
									{:else}
										<TableBodyCell>T</TableBodyCell>
									{/if}
								{:else if col === "battery"}
									<TableBodyCell
										style="background-color: rgba(255,0,0,{frame.battery < 11 && frame.battery > 0
											? (-1.5 * frame.battery ** 2 - 6.6 * frame.battery + 255) / 255
											: 0})">{typeof frame.battery === "number" ? frame.battery.toFixed(2) : frame.battery}</TableBodyCell
									>
								{:else if ["averageTripTime", "lostPackets", "sentPackets", "signal", "noise", "txMCS", "rxMCS"].includes(col)}
									<TableBodyCell>{typeof frame[col] === "number" ? frame[col].toFixed(0) : frame[col]}</TableBodyCell>
								{:else if ["dataRateTotal", "txRate", "rxRate"].includes(col)}
									<TableBodyCell>{typeof frame[col] === "number" ? frame[col].toFixed(2) : frame[col]}</TableBodyCell>
								{:else}
									<TableBodyCell class={frame[col] ? "" : "bg-red-500"}>{frame[col] ? "Y" : "N"}</TableBodyCell>
								{/if}
							{/each}
						</TableBodyRow>
					{/each}
				{/if}
			</TableBody>
		</Table>
	{/await}
</div>
