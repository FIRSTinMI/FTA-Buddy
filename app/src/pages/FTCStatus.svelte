<script lang="ts">
	import { Select, Progressbar } from "flowbite-svelte";
	import { API } from "@the-orange-alliance/api";
	import { formatTimeShortNoAgoSeconds } from "../../../shared/formatTime";
	import { FTCAPI } from "../util/ftc-api";

    const ftcToken = "1FE16AA7-22DB-483A-8189-76AE11F4DD34";

	const toa = new API("ip5GZxhUKJCEeXtELck+hXk8lNqBEPH5YNXx5vDomLo=", "FTA Buddy");

	const regions = toa.getRegions();
	let region = "FIM";

	async function getEventsThisWeek(region: string) {
		const now = new Date();

		// Get the current day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
		const currentDay = now.getDay();

		// Calculate the most recent Monday
		const monday = new Date(now);
		monday.setDate(now.getDate() - (currentDay === 0 ? 6 : currentDay - 1)); // If Sunday, go back 6 days; otherwise, go back to Monday

		// Calculate the following Saturday
		const saturday = new Date(monday);
		saturday.setDate(monday.getDate() + 5);

		let events = await toa.getEvents({
			region_key: region,
			start_date: monday.toISOString(),
			end_date: saturday.toISOString(),
			includeMatchCount: true,
			between: true,
		});

		events = events
			.filter((event) => {
				return new Date(event.startDate) >= monday && new Date(event.endDate) <= saturday;
			})
			.sort((a, b) => {
				return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
			})
            .filter((event) => event.eventName.includes("Madison"));

		let matchesPromises = [];

		for (let event of events) {
			let promise = FTCAPI.getMatches(event.firstEventCode);
			matchesPromises.push(promise);
			promise.then((data) => {
				event.matches = data || []; // Ensure matches is an array even if undefined
                console.log(data);
			});
		}

		await Promise.all(matchesPromises);

		return events.map((event) => {
			let startDate = new Date(event.startDate);
			let endDate = new Date(event.endDate);

			if (!event.matches || event.matches.length === 0) {
				// If no matches, return basic event info
				return {
					eventName: event.eventName,
					startDate: `${startDate.getMonth() + 1}/${startDate.getDate()}`,
					endDate: `${endDate.getMonth() + 1}/${endDate.getDate()}`,
					matchCount: 0,
					lastMatch: null,
					averageCycleTime: null,
					lastThreeCycleTimes: [],
				};
			}

			// Safely find the last match
			let lastMatch = event.matches[0];

            for (let match of event.matches) {
                if (match.redScore > 0 || match.blueScore > 0) {
                    lastMatch = match;
                }
            }

			let timeSinceLastMatch = lastMatch && lastMatch.prestartTime ? (now.getTime() - new Date(lastMatch.prestartTime).getTime()) / 1000 : null;

			// Safely calculate average cycle time
			let totalCycleTime = event.matches.reduce((sum, match) => {
				if (!match || typeof match.cycleTime !== "number") return sum;
				return sum + match.cycleTime;
			}, 0);

			let validMatchCount = event.matches.filter((match) => match && typeof match.cycleTime === "number").length;
			let averageCycleTime = validMatchCount > 0 ? (totalCycleTime / validMatchCount).toFixed(2) : null;

			// Get last three matches with cycle times
			let lastThreeMatches = event.matches
				.filter((match) => match && match.scheduledTime) // Ensure valid matches
				.sort((a, b) => new Date(b.scheduledTime).getTime() - new Date(a.scheduledTime).getTime())
				.slice(0, 3);

			let lastThreeCycleTimes = lastThreeMatches.map((match) => match.cycleTime).filter((ct) => typeof ct === "number");


            console.log(lastMatch.scheduledTime.substring(0, 23));
            let aheadBehind = lastMatch.scheduledTime ? (new Date().getTime() - new Date(lastMatch.scheduledTime.substring(0, 23)).getTime()) : null;

            console.log(aheadBehind);

			return {
				eventName: event.eventName,
				startDate: `${startDate.getMonth() + 1}/${startDate.getDate()}`,
				endDate: `${endDate.getMonth() + 1}/${endDate.getDate()}`,
				matchCount: event.matchCount,
				lastMatch: lastMatch
					? {
							matchName: lastMatch.matchName,
                            matchNumber: parseInt(lastMatch.matchName.split(" ")[1]),
							timeSinceLastMatch: timeSinceLastMatch ? formatTimeShortNoAgoSeconds(timeSinceLastMatch) + " ago" : "N/A",
						}
					: null,
				averageCycleTime: averageCycleTime,
				lastThreeCycleTimes,
                aheadBehind
			};
		});
	}

	let eventsThisWeek = getEventsThisWeek(region);
	$: eventsThisWeek = getEventsThisWeek(region);
</script>

<div class="flex flex-col gap-2 m-2">
	<div class="max-w-xl">
		{#await regions}
			<p>Loading Regions...</p>
		{:then data}
			<Select items={data.map((d) => ({ name: d.description, value: d.regionKey }))} bind:value={region} />
		{:catch error}
			<p>Error: {error.message}</p>
		{/await}
	</div>
	{#await eventsThisWeek}
		<p>Loading Events...</p>
	{:then data}
		<div class="grid grid-cols-6 gap-2">
			<h2 class="text-lg font-semibold">Name</h2>
			<h2 class="text-lg font-semibold">Dates</h2>
			<h2 class="text-lg font-semibold">Progress</h2>
            <h2 class="text-lg font-semibold">Ahead/Behind</h2>
			<h2 class="text-lg font-semibold">Current Cycle Time</h2>
			<h2 class="text-lg font-semibold">Avg Cycle Time</h2>
			{#each data as event}
				<p class="font-semibold">{event.eventName}</p>
				<p>{event.startDate} - {event.endDate}</p>
                <div>
                    <p class="mb-1 text-base font-medium dark:text-white">{event.lastMatch?.matchName ?? 0}/{event.matchCount}</p>
                    <Progressbar class="bg-orange-500" progress={(event.lastMatch?.matchNumber ?? 0)/event.matchCount * 100} />
                </div>
                <p>{event.aheadBehind ? formatTimeShortNoAgoSeconds(event.aheadBehind) + (event.aheadBehind < 0 ? " Ahead" : " Behind") : "Unknown"}</p>
				<p>{event.lastMatch?.timeSinceLastMatch}</p>
				<p>{event.averageCycleTime}</p>
			{/each}
		</div>
	{/await}
</div>
