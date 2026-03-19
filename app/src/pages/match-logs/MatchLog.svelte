<script lang="ts">
	import { Button, TabItem, Tabs } from "flowbite-svelte";
	import { formatTimeNoAgo } from "../../../../shared/formatTime";
	import { ROBOT, type FMSLogFrame, type MatchLog } from "../../../../shared/types";
	import MatchGraph from "../../components/MatchGraph.svelte";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { navigate, route } from "../../router";
	import { decompressStationLog } from "../../util/log-compression";
	import { track } from "../../util/telemetry";

	const { matchid } = route.getParams("/logs/:matchid");

	track("match_log_viewed");

	const match = trpc.match.getMatch.query({ id: matchid });
	let data: MatchLog | undefined;

	match.then((matchdata) => {
		const log: MatchLog["log"] = [];

		if (matchdata.blue1_log) processLog(decompressStationLog(matchdata.blue1_log), ROBOT.blue1, log);
		if (matchdata.blue2_log) processLog(decompressStationLog(matchdata.blue2_log), ROBOT.blue2, log);
		if (matchdata.blue3_log) processLog(decompressStationLog(matchdata.blue3_log), ROBOT.blue3, log);
		if (matchdata.red1_log) processLog(decompressStationLog(matchdata.red1_log), ROBOT.red1, log);
		if (matchdata.red2_log) processLog(decompressStationLog(matchdata.red2_log), ROBOT.red2, log);
		if (matchdata.red3_log) processLog(decompressStationLog(matchdata.red3_log), ROBOT.red3, log);

		data = {
			blue1: matchdata.blue1 ?? 0,
			blue2: matchdata.blue2 ?? 0,
			blue3: matchdata.blue3 ?? 0,
			red1: matchdata.red1 ?? 0,
			red2: matchdata.red2 ?? 0,
			red3: matchdata.red3 ?? 0,
			level: matchdata.level,
			match_number: matchdata.match_number,
			play_number: matchdata.play_number,
			start_time: new Date(matchdata.start_time),
			log: log.sort((a, b) => a.timeStamp.getTime() - b.timeStamp.getTime()),
		};
	});

	function processLog(teamLog: FMSLogFrame[], team: ROBOT, log: MatchLog["log"]) {
		for (let i = 0; i < teamLog.length; i++) {
			// Round timestamp to nearest 500ms to merge frames from different stations
			// that correspond to the same point in time. matchTime alone is not granular
			// enough since frames arrive ~600ms apart but matchTime only changes each second.
			const frameKey = Math.round(new Date(teamLog[i].timeStamp).getTime() / 500);
			const existingFrame = log.find((frame) => Math.round(frame.timeStamp.getTime() / 500) === frameKey);
			if (existingFrame) {
				existingFrame[team] = teamLog[i];

				if (teamLog[i].auto) {
					existingFrame.auto = true;
				}
			} else {
				const newFrame: MatchLog["log"][number] = {
					matchTime: teamLog[i].matchTime,
					matchTimeBase: teamLog[i].matchTimeBase,
					timeStamp: new Date(teamLog[i].timeStamp),
					auto: false,
					blue1: null,
					blue2: null,
					blue3: null,
					red1: null,
					red2: null,
					red3: null,
				};
				newFrame[team] = teamLog[i];

				if (teamLog[i].auto) {
					newFrame.auto = true;
				}

				log.push(newFrame);
			}
		}
	}

	function back() {
		if (window.history.length <= 1) {
			navigate("/logs");
		} else {
			window.history.back();
		}
	}

	let graph: MatchGraph;

	function tabClick(stat: keyof FMSLogFrame) {
		window.history.replaceState(null, "", `/logs/${matchid}#${stat.toLowerCase()}`);
	}

	let batteryOpen = false;
	let averageTripTimeOpen = false;
	let dataRateTotalOpen = false;
	let lostPacketsOpen = false;
	let signalOpen = false;
	let noiseOpen = false;

	if (window.location.hash === "#battery") {
		batteryOpen = true;
	} else if (window.location.hash === "#averageTripTime") {
		averageTripTimeOpen = true;
	} else if (window.location.hash === "#dataRateTotal") {
		dataRateTotalOpen = true;
	} else if (window.location.hash === "#lostPackets") {
		lostPacketsOpen = true;
	} else if (window.location.hash === "#signal") {
		signalOpen = true;
	} else if (window.location.hash === "#noise") {
		noiseOpen = true;
	} else {
		averageTripTimeOpen = true;
	}
</script>

<div class="container mx-auto p-2 w-full flex flex-col gap-4 h-full overflow-y-auto">
	<div class="flex gap-2">
		<Button onclick={back} class="w-fit">Back</Button>
	</div>
	{#await match}
		<Spinner />
	{:then match}
		<div>
			<h1 class="text-xl">
				{match.event.toUpperCase()}
				{match.level === "None" ? "Test" : match.level} Match {match.match_number}/{match.play_number}
			</h1>
			<p>{formatTimeNoAgo(new Date(match.start_time))}</p>
			<p class="md:hidden text-gray-600 text-sm">View on desktop for more detail</p>
		</div>
		{#if data}
			<Tabs
				tabStyle="none"
				classes={{
					active: "p-1 md:p-4 w-full flex-grow text-primary-500 border-b-2 border-primary-500",
					inactive:
						"p-1 md:p-4 w-full text-gray-500 dark:text-gray-400 hover:text-gray-700 focus:ring-4 focus:ring-primary-300 focus:outline-none dark:hover:text-white disabled:cursor-not-allowed disabled:opacity-50",
					content: "mt-4",
				}}
			>
				<TabItem
					open={averageTripTimeOpen}
					class="w-full"
					onclick={() => tabClick("averageTripTime")}
					title="Ping"
				>
					<MatchGraph {data} log={data.log} stat="averageTripTime" />
				</TabItem>
				<TabItem open={batteryOpen} class="w-full" onclick={() => tabClick("battery")} title="Battery">
					<MatchGraph {data} log={data.log} stat="battery" />
				</TabItem>
				<TabItem open={dataRateTotalOpen} class="w-full" onclick={() => tabClick("dataRateTotal")} title="BWU">
					<MatchGraph {data} log={data.log} stat="dataRateTotal" />
				</TabItem>
				<TabItem
					open={lostPacketsOpen}
					class="w-full"
					onclick={() => tabClick("lostPackets")}
					title="Lost Packets"
				>
					<MatchGraph {data} log={data.log} stat="lostPackets" />
				</TabItem>
				<TabItem open={signalOpen} class="w-full" onclick={() => tabClick("signal")} title="Signal">
					<MatchGraph {data} log={data.log} stat="signal" />
				</TabItem>
				<TabItem open={noiseOpen} class="w-full" onclick={() => tabClick("noise")} title="Noise">
					<MatchGraph {data} log={data.log} stat="noise" />
				</TabItem>
			</Tabs>
			<h2>View a Team's Specific Log</h2>
			<div class="grid grid-cols-2 gap-1">
				<Button
					color="blue"
					onclick={() => navigate("/logs/:matchid/:station", { params: { matchid, station: "blue1" } })}
					>{data?.blue1}</Button
				>
				<Button
					color="red"
					onclick={() => navigate("/logs/:matchid/:station", { params: { matchid, station: "red1" } })}
					>{data?.red1}</Button
				>
				<Button
					color="blue"
					onclick={() => navigate("/logs/:matchid/:station", { params: { matchid, station: "blue2" } })}
					>{data?.blue2}</Button
				>
				<Button
					color="red"
					onclick={() => navigate("/logs/:matchid/:station", { params: { matchid, station: "red2" } })}
					>{data?.red2}</Button
				>
				<Button
					color="blue"
					onclick={() => navigate("/logs/:matchid/:station", { params: { matchid, station: "blue3" } })}
					>{data?.blue3}</Button
				>
				<Button
					color="red"
					onclick={() => navigate("/logs/:matchid/:station", { params: { matchid, station: "red3" } })}
					>{data?.red3}</Button
				>
			</div>
		{/if}
	{/await}
</div>
