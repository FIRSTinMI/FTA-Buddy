<script lang="ts">
	import { TabItem, Tabs } from "flowbite-svelte";
	import { formatTime } from "../../../../shared/formatTime";
	import type { MatchRouterOutputs } from "../../../../src/router/logs";
	import MatchListTab from "../../components/MatchListTab.svelte";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { navigate } from "../../router";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";

	const matches = trpc.match.getMatches.query({});

	type MatchList = MatchRouterOutputs["getMatches"];
	type FieldBuckets = { test: MatchList; practice: MatchList; qualification: MatchList; playoff: MatchList };

	let allMatches: MatchList = $state([]);

	// Per-field match buckets for combined (meshed) view
	const fieldMatches = $state<Record<string, FieldBuckets>>({});

	matches.then((data) => {
		allMatches = [...data].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

		// Bucket by field for combined view
		for (let match of data) {
			const code = match.event_code;
			if (code) {
				if (!fieldMatches[code]) {
					fieldMatches[code] = { test: [], practice: [], qualification: [], playoff: [] };
				}
				if (match.level === "None") fieldMatches[code].test.push(match);
				else if (match.level === "Practice") fieldMatches[code].practice.push(match);
				else if (match.level === "Qualification") fieldMatches[code].qualification.push(match);
				else if (match.level === "Playoff") fieldMatches[code].playoff.push(match);
			}
		}
	});

	const tabClasses = {
		active: "p-4 w-full flex-grow text-primary-500 border-b-2 border-primary-500",
		inactive:
			"p-4 w-full text-gray-500 dark:text-gray-400 hover:text-gray-700 focus:ring-4 focus:ring-primary-300 focus:outline-none dark:hover:text-white disabled:cursor-not-allowed disabled:opacity-50",
		content: "mt-4",
	};

	let searchTerm = $state("");
	let filteredMatches = $derived(
		allMatches.filter(
			(m) =>
				!searchTerm ||
				m.blue1?.toString().includes(searchTerm) ||
				m.blue2?.toString().includes(searchTerm) ||
				m.blue3?.toString().includes(searchTerm) ||
				m.red1?.toString().includes(searchTerm) ||
				m.red2?.toString().includes(searchTerm) ||
				m.red3?.toString().includes(searchTerm),
		),
	);

	let isCombined = $derived(
		!!$userStore.meshedEventToken &&
			$userStore.meshedEventToken === $userStore.eventToken &&
			!!$eventStore.subEvents?.length,
	);
</script>

<div class="h-full overflow-y-auto">
	<div class="container mx-auto p-2 w-full">
		<h1 class="text-3xl font-bold p-2">Event Match Logs</h1>
		{#await matches}
			<Spinner />
		{:then _}
			{#if isCombined}
				<!-- Combined view: outer tab per field, inner tabs for Practice/Qual/Playoff -->
				<Tabs tabStyle="none" classes={tabClasses}>
					{#each $eventStore.subEvents ?? [] as subEvent, i}
						<TabItem class="w-full" open={i === 0} title={subEvent.label}>
							{@const fm = fieldMatches[subEvent.code] ?? {
								test: [],
								practice: [],
								qualification: [],
								playoff: [],
							}}
							{@const innerOpen =
								fm.playoff.length > 0
									? "playoff"
									: fm.qualification.length > 0
										? "qualification"
										: fm.practice.length > 0
											? "practice"
											: "test"}
							<Tabs tabStyle="none" classes={tabClasses}>
								<MatchListTab matches={fm.test} open={innerOpen === "test"} label="Test" />
								<MatchListTab matches={fm.practice} open={innerOpen === "practice"} label="Practice" />
								<MatchListTab
									matches={fm.qualification}
									open={innerOpen === "qualification"}
									label="Qualification"
								/>
								<MatchListTab matches={fm.playoff} open={innerOpen === "playoff"} label="Playoff" />
							</Tabs>
						</TabItem>
					{/each}
				</Tabs>
			{:else}
				<!-- Sub-event view: flat chronological list, no tab bar -->
				<input
					type="text"
					placeholder="Search by team number"
					bind:value={searchTerm}
					class="w-full px-4 py-2 border-b border-neutral-200 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-700 text-sm focus:outline-none"
				/>
				<div class="relative overflow-x-auto rounded-lg bg-neutral-50 dark:bg-neutral-700 mt-2">
					<table class="w-full text-center text-sm">
						<thead class="bg-neutral-100 dark:bg-neutral-800">
							<tr>
								<th class="px-2 py-2 sticky left-0 z-10 bg-neutral-100 dark:bg-neutral-800">Type</th>
								<th
									class="px-4 py-2 hidden md:table-cell sticky left-0 z-10 bg-neutral-100 dark:bg-neutral-800"
									>Match</th
								>
								<th
									class="px-4 py-2 hidden md:table-cell sticky left-0 z-10 bg-neutral-100 dark:bg-neutral-800"
									>Play</th
								>
								<th class="px-4 py-2 md:hidden sticky left-0 z-10 bg-neutral-100 dark:bg-neutral-800"
									>M/P</th
								>
								<th class="px-4 py-2 hidden md:table-cell">Time</th>
								<th class="px-4 py-2 hidden md:table-cell">Blue 1</th>
								<th class="px-4 py-2 hidden md:table-cell">Blue 2</th>
								<th class="px-4 py-2 hidden md:table-cell">Blue 3</th>
								<th class="px-4 py-2 hidden md:table-cell">Red 1</th>
								<th class="px-4 py-2 hidden md:table-cell">Red 2</th>
								<th class="px-4 py-2 hidden md:table-cell">Red 3</th>
								<th class="px-1 py-2 md:hidden">B1</th>
								<th class="px-1 py-2 md:hidden">B2</th>
								<th class="px-1 py-2 md:hidden">B3</th>
								<th class="px-1 py-2 md:hidden">R1</th>
								<th class="px-1 py-2 md:hidden">R2</th>
								<th class="px-1 py-2 md:hidden">R3</th>
								<th class="px-4 py-2">Logs</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredMatches as match}
								<tr class="cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-600">
									<td
										class="px-2 py-2 sticky left-0 z-10 bg-neutral-50 dark:bg-neutral-700 text-xs text-gray-500 dark:text-gray-400"
									>
										{match.level === "None"
											? "Test"
											: match.level === "Qualification"
												? "Qual"
												: match.level}
									</td>
									<td
										class="px-4 py-2 hidden md:table-cell sticky left-0 z-10 bg-neutral-50 dark:bg-neutral-700"
										onclick={() => navigate("/logs/:matchid", { params: { matchid: match.id } })}
										>{match.match_number}</td
									>
									<td
										class="px-4 py-2 hidden md:table-cell sticky left-0 z-10 bg-neutral-50 dark:bg-neutral-700"
										onclick={() => navigate("/logs/:matchid", { params: { matchid: match.id } })}
										>{match.play_number}</td
									>
									<td
										class="px-4 py-2 md:hidden sticky left-0 z-10 bg-neutral-50 dark:bg-neutral-700"
										onclick={() => navigate("/logs/:matchid", { params: { matchid: match.id } })}
										>{match.match_number}/{match.play_number}</td
									>
									<td
										class="px-4 py-2 hidden md:table-cell"
										onclick={() => navigate("/logs/:matchid", { params: { matchid: match.id } })}
										>{formatTime(new Date(match.start_time))}</td
									>
									<td
										class="px-1 py-2 bg-blue-400 dark:bg-blue-600 hover:bg-opacity-50 hover:underline"
										onclick={() =>
											navigate("/logs/:matchid/:station", {
												params: { matchid: match.id, station: "blue1" },
											})}
										>{match.blue1 ?? "None"}{#if match.blue1_has_event}<span class="ml-1">⚙️</span
											>{/if}{#if match.blue1_bypassed}<span class="ml-1">🚫</span>{/if}</td
									>
									<td
										class="px-1 py-2 bg-blue-400 dark:bg-blue-600 hover:bg-opacity-50 hover:underline"
										onclick={() =>
											navigate("/logs/:matchid/:station", {
												params: { matchid: match.id, station: "blue2" },
											})}
										>{match.blue2 ?? "None"}{#if match.blue2_has_event}<span class="ml-1">⚙️</span
											>{/if}{#if match.blue2_bypassed}<span class="ml-1">🚫</span>{/if}</td
									>
									<td
										class="px-1 py-2 bg-blue-400 dark:bg-blue-600 hover:bg-opacity-50 hover:underline"
										onclick={() =>
											navigate("/logs/:matchid/:station", {
												params: { matchid: match.id, station: "blue3" },
											})}
										>{match.blue3 ?? "None"}{#if match.blue3_has_event}<span class="ml-1">⚙️</span
											>{/if}{#if match.blue3_bypassed}<span class="ml-1">🚫</span>{/if}</td
									>
									<td
										class="px-1 py-2 bg-red-400 dark:bg-red-600 hover:bg-opacity-50 hover:underline"
										onclick={() =>
											navigate("/logs/:matchid/:station", {
												params: { matchid: match.id, station: "red1" },
											})}
										>{match.red1 ?? "None"}{#if match.red1_has_event}<span class="ml-1">⚙️</span
											>{/if}{#if match.red1_bypassed}<span class="ml-1">🚫</span>{/if}</td
									>
									<td
										class="px-1 py-2 bg-red-400 dark:bg-red-600 hover:bg-opacity-50 hover:underline"
										onclick={() =>
											navigate("/logs/:matchid/:station", {
												params: { matchid: match.id, station: "red2" },
											})}
										>{match.red2 ?? "None"}{#if match.red2_has_event}<span class="ml-1">⚙️</span
											>{/if}{#if match.red2_bypassed}<span class="ml-1">🚫</span>{/if}</td
									>
									<td
										class="px-1 py-2 bg-red-400 dark:bg-red-600 hover:bg-opacity-50 hover:underline"
										onclick={() =>
											navigate("/logs/:matchid/:station", {
												params: { matchid: match.id, station: "red3" },
											})}
										>{match.red3 ?? "None"}{#if match.red3_has_event}<span class="ml-1">⚙️</span
											>{/if}{#if match.red3_bypassed}<span class="ml-1">🚫</span>{/if}</td
									>
									<td
										class="px-4 py-2 dark:bg-neutral-700 hover:bg-opacity-50 hover:underline"
										onclick={() => navigate("/logs/:matchid", { params: { matchid: match.id } })}
										>View</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{/await}
	</div>
</div>
