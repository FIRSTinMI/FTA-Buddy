<script lang="ts">
	import Icon from "@iconify/svelte";
	import { onDestroy, onMount } from "svelte";
	import { get } from "svelte/store";
	import { cycleTimeToMS } from "../../../shared/cycleTimeToMS";
	import { formatTimeShortNoAgo, formatTimeShortNoAgoSeconds } from "../../../shared/formatTime";
	import {
		FieldState,
		MatchState,
		MatchStateMap,
		ROBOT,
		type MonitorFrame,
		type ScheduleDetails,
	} from "../../../shared/types";
	import MonitorRow from "../components/MonitorRow.svelte";
	import Spinner from "../components/Spinner.svelte";
	import TeamModal from "../components/TeamModal.svelte";
	import { audioQueuer, frameHandler, subscribeToFieldMonitor } from "../field-monitor";
	import { trpc } from "../main";
	import { fullscreen } from "../stores/fullscreen";
	import { eventStore } from "../stores/event";
	import { userStore } from "../stores/user";
	import type { MonitorEvent } from "../util/monitorFrameHandler";
	import { updateScheduleText } from "../util/schedule-detail-formatter";

	let monitorFrame: MonitorFrame | undefined = $state(frameHandler.getFrame());
	let cycleSubscription: ReturnType<typeof trpc.cycles.subscription.subscribe>;

	let user = get(userStore);
	const unsubscribeUserStore = userStore.subscribe((value) => {
		if (user.eventToken !== value.eventToken) {
			user = value;
			subscribeToFieldMonitor();
		} else {
			user = value;
		}
	});

	function onFrameEvent(evt: Event) {
		loading = false;
		monitorFrame = (evt as MonitorEvent).detail.frame;
	}

	let lastCycleTime = $state("");
	let lastCycleTimeMS = 0;
	let matchStartTime = new Date();
	let bestCycleTimeMS = 0;
	let currentCycleIsBest = $state(false);
	let averageCycleTimeMS = $state(8 * 60 * 1000); // Default to 7 minutes
	let currentCycleTimeRedness = $state(0);
	let currentCycleTime = $state("");
	let calculatedCycleTime: number | undefined | null = 0;

	let scheduleDetails: ScheduleDetails | undefined;
	let scheduleText = $state("");

	onMount(async () => {
		frameHandler.addEventListener("frame", onFrameEvent);
		frameHandler.addEventListener("match-start", onMatchStart);
		subscribeToFieldMonitor();
		const lastPrestart = await trpc.cycles.getLastPrestart.query();
		const lastMatchStart = await trpc.cycles.getLastMatchStart.query();
		if (lastPrestart) matchStartTime = lastPrestart;
		if (lastMatchStart) matchStartTime = lastMatchStart;

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
			},
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
			averageCycleTimeMS,
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
		frameHandler.removeEventListener("frame", onFrameEvent);
		frameHandler.removeEventListener("match-start", onMatchStart);
		unsubscribeUserStore();
		if (cycleSubscription) cycleSubscription.unsubscribe();
		clearInterval(interval);
		clearInterval(lastCycleTimeInterval);
	});

	async function onMatchStart(_evt: Event) {
		console.log("match-start");
		currentCycleIsBest = false;
		calculatedCycleTime = calculatedCycleTime || frameHandler.getLastCycleTime();

		console.log({
			calculatedCycleTime,
			lastCycleTime: frameHandler.getLastCycleTime(),
			ourCycleTime: new Date().getTime() - matchStartTime.getTime(),
			serverCycleTime: cycleTimeToMS((await trpc.cycles.getLastCycleTime.query()) ?? "-1"),
		});

		// Doesn't always update quick enough
		if (!calculatedCycleTime || calculatedCycleTime === lastCycleTimeMS) {
			lastCycleTime = formatTimeShortNoAgo(matchStartTime);
			lastCycleTimeMS = new Date().getTime() - matchStartTime.getTime();
		} else {
			lastCycleTimeMS = calculatedCycleTime;
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
			averageCycleTimeMS,
		);

		// Reset the cycle time so it doesn't screw up the next match's cycle time
		calculatedCycleTime = undefined;
	}

	let interval = setInterval(() => {
		const currentTime = new Date().getTime() - matchStartTime.getTime();
		if (currentTime < averageCycleTimeMS) {
			currentCycleTimeRedness = 0;
		} else {
			currentCycleTimeRedness = Math.min(1, (currentTime - averageCycleTimeMS) / 1000 / 120);
		}

		currentCycleTime = formatTimeShortNoAgo(matchStartTime);
	}, 1000);

	let lastCycleTimeInterval = setInterval(() => {
		if (lastCycleTimeMS !== frameHandler.getLastCycleTime()) {
			// console.log("Cycle time is not matching", {
			// 	current: lastCycleTimeMS,
			// 	new: frameHandler.getLastCycleTime(),
			// });
			lastCycleTimeMS = frameHandler.getLastCycleTime() || 0;
			lastCycleTime = formatTimeShortNoAgoSeconds(lastCycleTimeMS);
		}
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

	let modalOpen = $state(false);
	let modalStation: ROBOT = $state(ROBOT.blue1);

	function detailView(evt: Event) {
		let target = evt.target as HTMLElement;
		let station = target.id.split("-")[0] as ROBOT;
		modalStation = (station as ROBOT) || ROBOT.blue1;
		modalOpen = true;
	}

	const stations: ROBOT[] = Object.values(ROBOT);

	let loading = $state(true);
</script>

{#if monitorFrame}
	<TeamModal bind:modalOpen {modalStation} {monitorFrame} {frameHandler} />
{/if}

<div class="fixed inset-0" class:hidden={!loading}>
	<Spinner />
</div>

<div class="flex-1 min-h-0 overflow-hidden">
	<div
		class="grid grid-cols-fieldmonitor 2xl:grid-cols-fieldmonitor-large gap-0.5 md:gap-1 2xl:gap-2 mx-auto justify-center"
		class:fullscreen={$fullscreen}
		class:hidden={loading}
	>
		{#if monitorFrame}
			<div
				class="col-span-6 lg:col-span-9 flex text-lg md:text-2xl font-semibold"
				class:lg:text-5xl={$fullscreen}
			>
				<div class="px-2">M: {monitorFrame.match}</div>
				<div class="flex-1 px-2 text-center">{FieldStates[monitorFrame.field]}</div>
				<div class="px-2">{monitorFrame.exactAheadBehind || monitorFrame.time}</div>
				<button
					class="text-sm fixed top-12 right-0 z-50 hidden md:block"
					onclick={async (evt) => {
						evt.preventDefault();
						if ($fullscreen) {
							const exit: (() => Promise<void>) | undefined =
								document.exitFullscreen?.bind(document) ??
								(document as any).webkitExitFullscreen?.bind(document);
							await exit?.();
						} else {
							const el = document.documentElement;
							const enter: (() => Promise<void>) | undefined =
								el.requestFullscreen?.bind(el) ?? (el as any).webkitRequestFullscreen?.bind(el);
							await enter?.();
						}
					}}
				>
					{#if $fullscreen}
						<Icon icon="mdi:fullscreen-exit" class="w-8 h-8" />
					{:else}
						<Icon icon="mdi:fullscreen" class="w-8 h-8" />
					{/if}
				</button>
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
				<MonitorRow {station} {monitorFrame} {detailView} />
			{/each}
		{/if}
		<div
			class="col-span-6 lg:col-span-9 flex text-lg md:text-2xl font-semibold tabular-nums"
			class:lg:text-4xl={$fullscreen}
		>
			<div class="text-left" class:text-4xl={$fullscreen} class:text-green-500={currentCycleIsBest}>
				C: {lastCycleTime} (A: {formatTimeShortNoAgoSeconds(averageCycleTimeMS)})
			</div>
			<div class="grow" class:text-4xl={$fullscreen}>
				<span class="hidden sm:inline">{scheduleText}</span>
			</div>
			<div
				class="text-right"
				class:text-4xl={$fullscreen}
				style="color: rgba({75 * currentCycleTimeRedness + 180}, {180 * (1 - currentCycleTimeRedness)}, {180 *
					(1 - currentCycleTimeRedness)}, 1)"
			>
				T: {currentCycleTime}
			</div>
		</div>
		{#if !monitorFrame}
			{#if $eventStore?.notepadOnly}
				<p class="text-yellow-400">No live field data - running in Notepad Only mode</p>
			{:else}
				<p>Requires Chrome Extension to be setup on field network</p>
			{/if}
		{/if}
	</div>
</div>
