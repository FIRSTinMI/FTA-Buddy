<script lang="ts">
	import { Select, Progressbar, Spinner, Checkbox } from "flowbite-svelte";
	import { formatTimeNoAgo, formatTimeShortNoAgo, formatTimeShortNoAgoSeconds } from "../../../shared/formatTime";
	import { trpc } from "../main";
	import type { FTCEvent } from "../../../src/router/ftc";
	import { onMount } from "svelte";

	let region = "FIM";
	let events: string[] = []; //["2425-FIM-MHQ"];
	let eventData: FTCEvent[] = [];
	let subscription: ReturnType<typeof trpc.ftc.dashboard.subscribe> | null = null;

	let loading = true;

	async function getEventsForRegion(region: string) {
		events = (await trpc.ftc.getEventsThisWeek.query({ region })).map((event) => event.key);
		return events;
	}

	function subscribeToEvents(events: string[]) {
		if (subscription) subscription.unsubscribe();
		subscription = trpc.ftc.dashboard.subscribe(
			{ region, events },
			{
				onData: (data) => {
					if (data.length > 0) loading = false;
					console.log(data);
					eventData = data;
				},
			}
		);
	}

	onMount(async () => {
		subscribeToEvents(await getEventsForRegion(region));
	});

	let eventCurrentCycleTimes = eventData.map((event) => ({
		event: event.key,
		time: event.currentMatch?.postResultTime ? formatTimeShortNoAgo(event.currentMatch?.postResultTime) : "Unknown",
	}));

	setInterval(async () => {
		eventCurrentCycleTimes = eventData.map((event) => ({
			event: event.key,
			time: event.currentMatch?.postResultTime ? formatTimeShortNoAgo(event.currentMatch?.postResultTime) : "Unknown",
		}));
	}, 1000);
</script>

<div class="flex flex-col gap-2 m-2">
	<div class="max-w-xl">
		{#await trpc.ftc.getRegions.query()}
			<p>Loading Regions...</p>
		{:then data}
			<Select items={data} bind:value={region} on:change={async () => subscribeToEvents(await getEventsForRegion(region))} />
		{:catch error}
			<p>Error: {error.message}</p>
		{/await}
	</div>
	<div class="grid grid-cols-3 md:grid-cols-[.20fr_.15fr_.30fr_.12fr_.12fr_.11fr] gap-2 items-end">
		<h2 class="text-lg font-semibold hidden md:block">Name</h2>
		<h2 class="text-lg font-semibold hidden md:block">Dates</h2>
		<h2 class="text-lg font-semibold hidden md:block">Progress</h2>
		<h2 class="text-lg font-semibold">Ahead/Behind</h2>
		<h2 class="text-lg font-semibold">Current Cycle Time</h2>
		<h2 class="text-lg font-semibold">Avg Cycle Time</h2>
		{#each eventData as event}
			{#if events.includes(event.key)}
				<p class="col-span-3 md:col-span-1 font-semibold border-t border-gray-600 pt-1 mt-1 md:border-none md:mt-0 md:pt-0">{event.name}</p>
				<p class="hidden md:block">{event.startDate.toLocaleDateString()} - {event.endDate.toLocaleDateString()}</p>
				<div class="col-span-3 md:col-span-1">
					<p class="mb-1 text-base font-medium dark:text-white">{event.currentMatch?.description ?? "Unknown"}</p>
					<Progressbar color="red" progress={(event.completedMatches / event.totalMatches) * 100} />
				</div>
				<p>{event.aheadBehind ? formatTimeShortNoAgoSeconds(event.aheadBehind) + (event.aheadBehind < 0 ? " Ahead" : " Behind") : "Unknown"}</p>
				<p>{eventCurrentCycleTimes.find((c) => c.event === event.key)?.time}</p>
				<p>{formatTimeShortNoAgoSeconds(event.averageCycleTime)}</p>
			{/if}
		{/each}
	</div>

	{#if loading}
		<div class="w-full">
			<Spinner class="size-16 mx-auto mt-12" />
		</div>
	{/if}
</div>
