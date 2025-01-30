<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Card, Button } from "flowbite-svelte";
	import { trpc } from "../main";
	import type { ScheduleDetails } from "../../../shared/types";
	import { onDestroy, onMount } from "svelte";
	import { cycleTimeToMS } from "../../../shared/cycleTimeToMS";
	import { formatTimeShortNoAgo, formatTimeShortNoAgoMinutesOnly, formatTimeShortNoAgoSeconds } from "../../../shared/formatTime";
	import { updateScheduleText } from "../util/schedule-detail-formatter";
	import Spinner from "./Spinner.svelte";

	export let eventCode: string;
	export let remove: (eventCode: string) => void;
	export let removable: boolean = true;

	let cycleSubscription: ReturnType<typeof trpc.cycles.subscription.subscribe>;

	let lastCycleTime = "";
	let lastCycleTimeMS = 0;
	let matchStartTime = new Date();
	let bestCycleTimeMS = 0;
	let currentCycleIsBest = false;
	let averageCycleTimeMS = 8 * 60 * 1000; // Default to 7 minutes
	let currentCycleTimeRedness = 0;
	let currentCycleTime = "";
	let calculatedCycleTime: number | undefined | null = 0;
	let match = 0;
	let level = "";
	let aheadBehind = "";

	let loading = true;

	let scheduleDetails: ScheduleDetails | undefined;
	let scheduleText = "";

	onMount(async () => {
		console.log("EventStatus mounted", eventCode);

		const cycleData = await trpc.cycles.getCycleData.query({ eventCode });

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
			aheadBehind = cycleData.aheadBehind;
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
				},
			}
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

<Card padding={window.innerWidth < 640 ? "sm" : "lg"} class="py-1 px-2">
	{#if loading}
		<div class="inset-0 z-50">
			<Spinner />
		</div>
	{/if}

	<div class="flex">
		<h1 class="text-lg lg:text-2xl font-bold flex-1">{eventCode}</h1>
		{#if removable}
			<Button on:click={() => remove(eventCode)} color="none" class="p-0"><Icon icon="mdi:close" class="size-6" /></Button>
		{/if}
	</div>

	<div class:blur={loading}>
		<h2 class="text-lg lg:mt-2">Match: {match}</h2>
		<h4 class="text-lg font-bold lg:text-xl">{aheadBehind}</h4>

		<div
			class="lg:text-lg lg:mt-2"
			style="color: rgba({75 * currentCycleTimeRedness + 180}, {180 * (1 - currentCycleTimeRedness)}, {180 * (1 - currentCycleTimeRedness)}, 1)"
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
