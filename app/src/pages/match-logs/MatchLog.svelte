<script lang="ts">
	import { Button, TabItem, Tabs } from "flowbite-svelte";
	import { trpc } from "../../main";
	import { navigate } from "svelte-routing";
	import Spinner from "../../components/Spinner.svelte";
	import { ROBOT, type FMSLogFrame, type MatchLog } from "../../../../shared/types";
	import MatchGraph from "../../components/MatchGraph.svelte";
	import { formatTimeNoAgo } from "../../../../shared/formatTime";

	export let matchid: string;

	const match = trpc.match.getMatch.query({ id: matchid });
	let data: MatchLog | undefined;

	match.then((matchdata) => {
		const log: MatchLog["log"] = [];

		processLog(matchdata.blue1_log as FMSLogFrame[], ROBOT.blue1, log);
		processLog(matchdata.blue2_log as FMSLogFrame[], ROBOT.blue2, log);
		processLog(matchdata.blue3_log as FMSLogFrame[], ROBOT.blue3, log);
		processLog(matchdata.red1_log as FMSLogFrame[], ROBOT.red1, log);
		processLog(matchdata.red2_log as FMSLogFrame[], ROBOT.red2, log);
		processLog(matchdata.red3_log as FMSLogFrame[], ROBOT.red3, log);

		data = {
			blue1: matchdata.blue1,
			blue2: matchdata.blue2,
			blue3: matchdata.blue3,
			red1: matchdata.red1,
			red2: matchdata.red2,
			red3: matchdata.red3,
			level: matchdata.level,
			match_number: matchdata.match_number,
			play_number: matchdata.play_number,
			start_time: new Date(matchdata.start_time),
			log: log.sort((a, b) => a.timeStamp.getTime() - b.timeStamp.getTime()),
		};
	});

	function processLog(teamLog: FMSLogFrame[], team: ROBOT, log: MatchLog["log"]) {
		for (let i = 0; i < teamLog.length; i++) {
			const existingFrame = log.find((frame) => frame.matchTime === teamLog[i].matchTime);
			if (existingFrame) {
				existingFrame[team] = teamLog[i];

				if (teamLog[i].auto) {
					existingFrame.auto = true;
				}
			} else {
				const newFrame = {
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
		if (window.history.state === null) {
			navigate("/app/logs");
		} else {
			window.history.back();
		}
	}

	let graph: MatchGraph;

	function tabClick(stat: keyof FMSLogFrame) {
		window.history.replaceState(null, "", `/app/logs/${matchid}#${stat.toLowerCase()}`);
	}

	let batteryOpen = false;
	let averageTripTimeOpen = false;
	let dataRateTotalOpen = false;
	let lostPacketsOpen = false;
	let signalOpen = false;
	let noiseOpen = false;
	let txMCSOpen = false;
	let rxMCSOpen = false;

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
	} else if (window.location.hash === "#txMCS") {
		txMCSOpen = true;
	} else if (window.location.hash === "#rxMCS") {
		rxMCSOpen = true;
	} else {
		averageTripTimeOpen = true;
	}
</script>

<div class="container mx-auto p-2 w-full flex flex-col gap-4">
	<div class="flex gap-2">
		<Button on:click={back} class="w-fit">Back</Button>
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
				defaultClass="flex"
				activeClasses="p-4 w-full flex-grow text-primary-500 border-b-2 border-primary-500"
				inactiveClasses="p-4 w-full text-gray-500 dark:text-gray-400 hover:text-gray-700 focus:ring-4 focus:ring-primary-300 focus:outline-none dark:hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
				contentClass="mt-4"
			>
				<TabItem open={averageTripTimeOpen} class="w-full" on:click={() => tabClick("averageTripTime")}>
					<span slot="title">Ping</span>

					<MatchGraph {data} log={data.log} stat="averageTripTime" />
				</TabItem>
				<TabItem open={batteryOpen} class="w-full" on:click={() => tabClick("battery")}>
					<span slot="title">Battery</span>

					<MatchGraph {data} log={data.log} stat="battery" />
				</TabItem>
				<TabItem open={dataRateTotalOpen} class="w-full" on:click={() => tabClick("dataRateTotal")}>
					<span slot="title">BWU</span>

					<MatchGraph {data} log={data.log} stat="dataRateTotal" />
				</TabItem>
				<TabItem open={lostPacketsOpen} class="w-full" on:click={() => tabClick("lostPackets")}>
					<span slot="title">Lost Packets</span>

					<MatchGraph {data} log={data.log} stat="lostPackets" />
				</TabItem>
				<TabItem open={signalOpen} class="w-full" on:click={() => tabClick("signal")}>
					<span slot="title">Signal</span>

					<MatchGraph {data} log={data.log} stat="signal" />
				</TabItem>
				<TabItem open={noiseOpen} class="w-full" on:click={() => tabClick("noise")}>
					<span slot="title">Noise</span>

					<MatchGraph {data} log={data.log} stat="noise" />
				</TabItem>
				<TabItem open={txMCSOpen} class="w-full" on:click={() => tabClick("txMCS")}>
					<span slot="title">TX MCS</span>

					<MatchGraph {data} log={data.log} stat="txMCS" />
				</TabItem>
				<TabItem open={rxMCSOpen} class="w-full" on:click={() => tabClick("rxMCS")}>
					<span slot="title">RX MCS</span>

					<MatchGraph {data} log={data.log} stat="rxMCS" />
				</TabItem>
			</Tabs>
		{/if}
	{/await}
</div>
