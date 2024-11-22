<script lang="ts">
	import { Select, Progressbar, Spinner, Checkbox } from "flowbite-svelte";
	import { formatTimeNoAgo, formatTimeShortNoAgo, formatTimeShortNoAgoSeconds } from "../../../shared/formatTime";
	import { trpc } from "../main";
	import type { FTCEvent } from "../../../src/router/ftc";

	let region = "FIM";
	let events: string[] = []; //["2425-FIM-MHQ"];
	let eventData: FTCEvent[] = [];
	let subscription: ReturnType<typeof trpc.ftc.dashboard.subscribe> | null = null;

	let loading = true;

	$: {
		subscribeToEvents(events);
		getEventsForRegion(region);
	}

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
</script>

<div class="flex flex-col gap-2 m-2">
	<div class="max-w-xl">
		{#await trpc.ftc.getRegions.query()}
			<p>Loading Regions...</p>
		{:then data}
			<Select items={data} bind:value={region} />
		{:catch error}
			<p>Error: {error.message}</p>
		{/await}
	</div>
	<div class="grid grid-cols-[.20fr_.15fr_.30fr_.12fr_.12fr_.11fr] gap-2">
		<h2 class="text-lg font-semibold">Name</h2>
		<h2 class="text-lg font-semibold">Dates</h2>
		<h2 class="text-lg font-semibold">Progress</h2>
		<h2 class="text-lg font-semibold">Ahead/Behind</h2>
		<h2 class="text-lg font-semibold">Current Cycle Time</h2>
		<h2 class="text-lg font-semibold">Avg Cycle Time</h2>
		{#each eventData as event}
			{#if events.includes(event.key)}
				<p class="font-semibold">{event.name}</p>
				<p>{event.startDate.toLocaleDateString()} - {event.endDate.toLocaleDateString()}</p>
				<div>
					<p class="mb-1 text-base font-medium dark:text-white">{event.currentMatch?.description}</p>
					<Progressbar class="bg-orange-500" progress={(event.completedMatches / event.totalMatches) * 100} />
				</div>
				<p>{event.aheadBehind ? formatTimeShortNoAgoSeconds(event.aheadBehind) + (event.aheadBehind < 0 ? " Ahead" : " Behind") : "Unknown"}</p>
				<p>{event.currentMatch?.scheduledStartTime ? formatTimeShortNoAgo(event.currentMatch?.scheduledStartTime) : "Unknown"}</p>
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
