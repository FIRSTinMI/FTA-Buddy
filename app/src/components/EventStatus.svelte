<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Card } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import { cycleTimeToMS } from "../../../shared/cycleTimeToMS";
	import { formatTimeShortNoAgo, formatTimeShortNoAgoSeconds } from "../../../shared/formatTime";
	import type { FieldState, ScheduleDetails } from "../../../shared/types";
	import { trpc } from "../main";
	import { updateScheduleText } from "../util/schedule-detail-formatter";
	import Spinner from "./Spinner.svelte";

	let {
		eventCode,
		remove,
		removable = true,
	}: {
		eventCode: string;
		remove: (eventCode: string) => void;
		removable?: boolean;
	} = $props();

	let cycleSubscription: ReturnType<typeof trpc.cycles.subscription.subscribe>;

	let lastCycleTime = $state("");
	let lastCycleTimeMS = 0;
	let matchStartTime = $state(new Date());
	let bestCycleTimeMS = $state(0);
	let currentCycleIsBest = $state(false);
	let averageCycleTimeMS = $state(8 * 60 * 1000); // Default to 7 minutes
	let currentCycleTimeRedness = $state(0);
	let currentCycleTime = $state("");
	let calculatedCycleTime: number | undefined | null = $state(0);
	let match = $state(0);
	let level = $state("");
	let aheadBehind = $state("");
	let eventName = $state("");

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

	let loading = $state(true);

	let scheduleDetails: ScheduleDetails | undefined;
	let scheduleText = $state("");

	let fieldState: FieldState = 0;
	let fieldStateText = $derived(FieldStates[fieldState]);

	onMount(async () => {
		console.log("EventStatus mounted", eventCode);

		eventName = await trpc.event.getName.query({ code: eventCode });

		const cycleData = await trpc.cycles.getCycleData.query({ eventCode });

		matchStartTime = cycleData.startTime ? new Date(cycleData.startTime) : new Date();

		console.log("Cycle Data for " + eventCode, cycleData);

		if (cycleData) {
			lastCycleTimeMS = cycleTimeToMS(cycleData.lastCycleTime ?? "");
			lastCycleTime = formatTimeShortNoAgo(new Date(new Date().getTime() - lastCycleTimeMS));

			bestCycleTimeMS = cycleTimeToMS(cycleData.bestCycleTime ?? "");

			if (lastCycleTimeMS < bestCycleTimeMS) {
				bestCycleTimeMS = lastCycleTimeMS;
				currentCycleIsBest = true;
			}

			averageCycleTimeMS = cycleData.averageCycleTime ?? 8 * 60 * 1000;
			scheduleDetails = cycleData.scheduleDetails;
			match = cycleData.match;
			level = cycleData.level;
			aheadBehind = cycleData.exactAheadBehind || cycleData.aheadBehind;
		}

		if (cycleSubscription) cycleSubscription.unsubscribe();
		cycleSubscription = trpc.cycles.subscription.subscribe(
			{
				eventCode,
			},
			{
				onData: (data) => {
					averageCycleTimeMS = data.averageCycleTime ?? 8 * 60 * 1000;
					calculatedCycleTime = data.lastCycleTime ? cycleTimeToMS(data.lastCycleTime) : 0;
					matchStartTime = data.startTime ? new Date(data.startTime) : new Date();

					lastCycleTimeMS = cycleTimeToMS(data.lastCycleTime ?? "");
					lastCycleTime = formatTimeShortNoAgo(new Date(new Date().getTime() - lastCycleTimeMS));

					if (lastCycleTimeMS < bestCycleTimeMS) {
						bestCycleTimeMS = lastCycleTimeMS;
						currentCycleIsBest = true;
					} else {
						currentCycleIsBest = false;
					}

					averageCycleTimeMS = data.averageCycleTime ?? 8 * 60 * 1000;
					scheduleDetails = data.scheduleDetails;
					match = data.matchNumber;
					level = data.level;
					aheadBehind = data.exactAheadBehind || data.aheadBehind;
					fieldState = data.state;

					scheduleText = updateScheduleText(match, scheduleDetails, level, averageCycleTimeMS);
				},
			},
		);

		scheduleText = updateScheduleText(match, scheduleDetails, level, averageCycleTimeMS);

		console.log({
			matchStartTime,
			bestCycleTimeMS,
			lastCycleTimeMS,
			averageCycleTimeMS,
			calculatedCycleTime,
			scheduleDetails,
		});

		loading = false;
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

	onDestroy(() => {
		if (cycleSubscription) cycleSubscription.unsubscribe();
	});
</script>

<Card class="py-1 px-2">
	{#if loading}
		<div class="inset-0 z-50">
			<Spinner />
		</div>
	{/if}

	<div class="flex">
		<h1 class="text-lg lg:text-2xl font-bold flex-1">{eventName}</h1>
		{#if removable}
			<button onclick={() => remove(eventCode)} class="p-0"><Icon icon="mdi:close" class="size-6" /></button>
		{/if}
	</div>

	<div class:blur-sm={loading}>
		<h2 class="text-lg lg:mt-2">Match: {match}</h2>
		<p class="text-lg">{fieldStateText}</p>
		<h4 class="text-lg font-bold lg:text-xl">{aheadBehind}</h4>

		<div
			class="lg:text-lg lg:mt-2"
			style="color: rgba({75 * currentCycleTimeRedness + 180}, {180 * (1 - currentCycleTimeRedness)}, {180 *
				(1 - currentCycleTimeRedness)}, 1)"
		>
			T: {currentCycleTime}
		</div>

		<h2 class="lg:text-lg font-bold mt-2">Cycle Times</h2>
		<div class="grid grid-cols-2 gap-2">
			<p class="text-sm lg:py-1 text-right">Last Match</p>
			<p class="lg:text-lg text-left font-bold {currentCycleIsBest && 'text-green-500'}">{lastCycleTime}</p>
			<p class="text-sm lg:py-1 text-right">Best</p>
			<p class="lg:text-lg text-left font-bold">{formatTimeShortNoAgoSeconds(bestCycleTimeMS)}</p>
			<p class="text-sm lg:py-1 text-right">Average</p>
			<p class="lg:text-lg text-left font-bold">{formatTimeShortNoAgoSeconds(averageCycleTimeMS)}</p>
		</div>

		<p class="lg:text-lg mt-1 lg:mt-2">{scheduleText}</p>
	</div>
</Card>
