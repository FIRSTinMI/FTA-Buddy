<script lang="ts">
	import { FieldState, MatchState, MatchStateMap, ROBOT, type MonitorFrame, type ScheduleDetails } from "../../../shared/types";
	import MonitorRow from "../components/MonitorRow.svelte";
	import TeamModal from "../components/TeamModal.svelte";
	import { formatTimeShortNoAgo, formatTimeShortNoAgoMinutesOnly, formatTimeShortNoAgoSeconds } from "../../../shared/formatTime";
	import type { MonitorEvent, MonitorFrameHandler } from "../util/monitorFrameHandler";
	import { onDestroy, onMount } from "svelte";
	import { trpc } from "../main";
	import { cycleTimeToMS } from "../../../shared/cycleTimeToMS";
	import { userStore } from "../stores/user";
	import { audioQueuer } from "../field-monitor";
	import Spinner from "../components/Spinner.svelte";
	import { updateScheduleText } from "../util/schedule-detail-formatter";
	import { Button } from "flowbite-svelte";
	import Icon from "@iconify/svelte";

	export let frameHandler: MonitorFrameHandler;
	let monitorFrame: MonitorFrame | undefined = frameHandler.getFrame();
	let cycleSubscription: ReturnType<typeof trpc.cycles.subscription.subscribe>;

	frameHandler.addEventListener("frame", (evt) => {
		loading = false;
		monitorFrame = (evt as MonitorEvent).detail.frame;
	});

	let lastCycleTime = "";
	let lastCycleTimeMS = 0;
	let matchStartTime = new Date();
	let bestCycleTimeMS = 0;
	let currentCycleIsBest = false;
	let averageCycleTimeMS = 8 * 60 * 1000; // Default to 7 minutes
	let currentCycleTimeRedness = 0;
	let currentCycleTime = "";
	let calculatedCycleTime: number | undefined | null = 0;

	let scheduleDetails: ScheduleDetails | undefined;
	let scheduleText = "";

	onMount(async () => {
		const lastPrestart = await trpc.cycles.getLastPrestart.query();
		if (lastPrestart) matchStartTime = lastPrestart;

		monitorFrame = frameHandler.getFrame();

		loading = false;

		if (cycleSubscription) cycleSubscription.unsubscribe();
		cycleSubscription = trpc.cycles.subscription.subscribe(
			{
				eventToken: $userStore.eventToken,
			},
			{
				onData: (data) => {
					averageCycleTimeMS = data.averageCycleTime ?? 7 * 60 * 1000;
					calculatedCycleTime = data.lastCycleTime ? cycleTimeToMS(data.lastCycleTime) : 0;
				},
			}
		);

		const bestCycleTimeRes = await trpc.cycles.getBestCycleTime.query();
		if (bestCycleTimeRes && bestCycleTimeRes.calculated_cycle_time) {
			bestCycleTimeMS = cycleTimeToMS(bestCycleTimeRes.calculated_cycle_time);
		}

		const lastCycleTimeRes = await trpc.cycles.getLastCycleTime.query();
		if (lastCycleTimeRes) {
			lastCycleTimeMS = cycleTimeToMS(lastCycleTimeRes);
			lastCycleTime = formatTimeShortNoAgo(new Date(new Date().getTime() - lastCycleTimeMS));

			if (lastCycleTimeMS < bestCycleTimeMS) {
				bestCycleTimeMS = lastCycleTimeMS;
				currentCycleIsBest = true;
			}
		}

		averageCycleTimeMS = (await trpc.cycles.getAverageCycleTime.query()) ?? 8 * 60 * 1000;

		scheduleDetails = await trpc.cycles.getScheduleDetails.query();
		scheduleText = updateScheduleText(
			monitorFrame?.match ?? scheduleDetails?.lastPlayed ?? 0,
			scheduleDetails,
			monitorFrame?.level ?? "",
			averageCycleTimeMS
		);

		console.log({
			matchStartTime,
			bestCycleTimeMS,
			lastCycleTimeMS,
			averageCycleTimeMS,
			calculatedCycleTime,
			scheduleDetails,
		});

		setTimeout(async () => {
			if (MatchStateMap[frameHandler.getFrame()?.field ?? FieldState.PRESTART_COMPLETED] !== MatchState.RUNNING) {
				const frame = frameHandler.getFrame();
				const musicOrder = await trpc.event.getMusicOrder.query({
					level: frame?.level ?? "None",
					match: frame?.match ?? 1,
				});
				audioQueuer.playMusic(musicOrder);
			}
		}, 3e3);
	});

	onDestroy(() => {
		if (cycleSubscription) cycleSubscription.unsubscribe();
	});

	frameHandler.addEventListener("match-start", async (evt) => {
		currentCycleIsBest = false;
		calculatedCycleTime = calculatedCycleTime || frameHandler.getLastCycleTime();
		// Doesn't always update quick enough
		if (!calculatedCycleTime || calculatedCycleTime === lastCycleTimeMS) {
			lastCycleTime = formatTimeShortNoAgo(matchStartTime);
			lastCycleTimeMS = new Date().getTime() - matchStartTime.getTime();
		} else {
			lastCycleTime = formatTimeShortNoAgoSeconds(calculatedCycleTime);
		}
		if (lastCycleTimeMS < bestCycleTimeMS) {
			bestCycleTimeMS = lastCycleTimeMS;
			currentCycleIsBest = true;
		}
		matchStartTime = new Date();

		averageCycleTimeMS = (await trpc.cycles.getAverageCycleTime.query()) ?? 8 * 60 * 1000;

		scheduleText = updateScheduleText(
			monitorFrame?.match ?? scheduleDetails?.lastPlayed ?? 0,
			scheduleDetails,
			monitorFrame?.level ?? "",
			averageCycleTimeMS
		);
	});

	setInterval(() => {
		const currentTime = new Date().getTime() - matchStartTime.getTime();
		if (currentTime < averageCycleTimeMS) {
			currentCycleTimeRedness = 0;
		} else {
			currentCycleTimeRedness = Math.min(1, (currentTime - averageCycleTimeMS) / 1000 / 120);
		}

		currentCycleTime = formatTimeShortNoAgo(matchStartTime);
	}, 1000);

	const FieldStates = {
		0: "Unknown",
		1: "Match Running Teleop",
		2: "Match Transistioning",
		3: "Match Running Auto",
		4: "Match Ready",
		5: "Prestart Completed",
		6: "Prestart Initiated",
		7: "Ready to Prestart",
		8: "Match Aborted",
		9: "Match Over",
		10: "Ready for Post Result",
		11: "Match Not Ready",
	};

	let modalOpen = false;
	let modalStation: ROBOT = ROBOT.blue1;

	function detailView(evt: Event) {
		let target = evt.target as HTMLElement;
		let station = target.id.split("-")[0] as ROBOT;
		modalStation = (station as ROBOT) || ROBOT.blue1;
		modalOpen = true;
	}

	const stations: ROBOT[] = Object.values(ROBOT);

	export let fullscreen = window.outerWidth > 1900 ? window.innerHeight === 1080 : false;

	let loading = true;
</script>

{#if monitorFrame}
	<TeamModal bind:modalOpen {modalStation} {monitorFrame} {frameHandler} />
{/if}

<div class="fixed inset-0" class:hidden={!loading}>
	<Spinner />
</div>

<div
	class="grid grid-cols-fieldmonitor 2xl:grid-cols-fieldmonitor-large gap-0.5 md:gap-1 2xl:gap-2 mx-auto justify-center {fullscreen && 'fullscreen'}"
	class:hidden={loading}
>
	{#key monitorFrame}
		{#if monitorFrame}
			<div class="col-span-6 lg:col-span-9 flex text-lg md:text-2xl font-semibold {fullscreen && 'lg:text-5xl'}">
				<div class="px-2">M: {monitorFrame.match}</div>
				<div class="flex-1 px-2 text-center">{FieldStates[monitorFrame.field]}</div>
				<div class="px-2">{monitorFrame.time}</div>
				<Button
					color="none"
					class="hidden text-sm {!fullscreen && 'md:block fixed top-12 right-0 z-50'}"
					on:click={(evt) => {
						evt.preventDefault();
						fullscreen = !fullscreen;
						if (fullscreen) {
							document.documentElement.requestFullscreen();
						} else {
							document.exitFullscreen();
						}
					}}
				>
					{#if fullscreen}
						<Icon icon="mdi:fullscreen-exit" class="w-8 h-8" />
					{:else}
						<Icon icon="mdi:fullscreen" class="w-8 h-8" />
					{/if}
				</Button>
			</div>
			<p>Team</p>
			<p>DS</p>
			<p>Radio</p>
			<p>Rio</p>
			<p>Battery</p>
			<p class="hidden lg:flex">Ping (ms)</p>
			<p class="hidden lg:flex">BWU (mbps)</p>
			<p class="hidden lg:flex">Signal (dBm)</p>
			<p class="hidden lg:flex">Last Change</p>
			<p class="lg:hidden">Net</p>
			{#each stations as station}
				<MonitorRow {station} {monitorFrame} {detailView} {fullscreen} {frameHandler} />
			{/each}
		{/if}
		<div class="col-span-6 lg:col-span-9 flex text-lg md:text-2xl font-semibold tabular-nums {fullscreen && 'lg:text-4xl'}">
			<div class="text-left {fullscreen ? 'text-4xl' : 'md:text-2xl'} {currentCycleIsBest && 'text-green-500'}">
				C: {lastCycleTime} (A: {formatTimeShortNoAgoSeconds(averageCycleTimeMS)})
			</div>
			<div class="grow {fullscreen ? 'text-4xl' : 'md:text-2xl'}">
				<span class="hidden sm:inline">{scheduleText}</span>
			</div>
			<div
				class="text-right {fullscreen ? 'text-4xl' : 'md:text-2xl'}"
				style="color: rgba({75 * currentCycleTimeRedness + 180}, {180 * (1 - currentCycleTimeRedness)}, {180 * (1 - currentCycleTimeRedness)}, 1)"
			>
				T: {currentCycleTime}
			</div>
		</div>
	{/key}
	{#if !monitorFrame}
		<p>Requires Chrome Extension to be setup on field network</p>
	{/if}
</div>
