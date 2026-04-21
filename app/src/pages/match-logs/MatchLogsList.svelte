<script lang="ts">
	import { TabItem, Tabs } from "flowbite-svelte";
	import type { MatchRouterOutputs } from "../../../../src/router/logs";
	import MatchListTab from "../../components/MatchListTab.svelte";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";
	import { getPlayoffViewLabel } from "../../util/playoffViewLabel";

	const matches = trpc.match.getMatches.query({});

	type MatchList = MatchRouterOutputs["getMatches"];

	let allMatches: MatchList = $state([]);

	type FieldBuckets = { test: MatchList; practice: MatchList; qualification: MatchList; playoff: MatchList };

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

	let levelBuckets = $derived({
		test: allMatches.filter((m) => m.level === "None"),
		practice: allMatches.filter((m) => m.level === "Practice"),
		qualification: allMatches.filter((m) => m.level === "Qualification"),
		playoff: allMatches.filter((m) => m.level === "Playoff"),
	});

	let levelOpen = $derived(
		levelBuckets.playoff.length > 0
			? "playoff"
			: levelBuckets.qualification.length > 0
				? "qualification"
				: levelBuckets.practice.length > 0
					? "practice"
					: "test",
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
					{#if $eventStore.playoffMode}
						<!-- Inter-divisional playoffs: show the parent (Fimstein/Einstein) field first -->
						{@const parentFm = fieldMatches[$eventStore.code] ?? {
							test: [],
							practice: [],
							qualification: [],
							playoff: [],
						}}
						{@const parentLabel = getPlayoffViewLabel($eventStore.code)}
						{@const parentOpen =
							parentFm.playoff.length > 0
								? "playoff"
								: parentFm.qualification.length > 0
									? "qualification"
									: parentFm.practice.length > 0
										? "practice"
										: "test"}
						<TabItem class="w-full" open={true} title={parentLabel}>
							<Tabs tabStyle="none" classes={tabClasses}>
								<MatchListTab matches={parentFm.test} open={parentOpen === "test"} label="Test" />
								<MatchListTab
									matches={parentFm.practice}
									open={parentOpen === "practice"}
									label="Practice"
								/>
								<MatchListTab
									matches={parentFm.qualification}
									open={parentOpen === "qualification"}
									label="Qualification"
								/>
								<MatchListTab
									matches={parentFm.playoff}
									open={parentOpen === "playoff"}
									label="Playoff"
								/>
							</Tabs>
						</TabItem>
					{/if}
					{#each $eventStore.subEvents ?? [] as subEvent, i}
						<TabItem class="w-full" open={i === 0 && !$eventStore.playoffMode} title={subEvent.label}>
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
				<!-- Standalone / sub-event view: level tabs -->
				<Tabs tabStyle="none" classes={tabClasses}>
					<MatchListTab matches={levelBuckets.test} open={levelOpen === "test"} label="Test" />
					<MatchListTab matches={levelBuckets.practice} open={levelOpen === "practice"} label="Practice" />
					<MatchListTab
						matches={levelBuckets.qualification}
						open={levelOpen === "qualification"}
						label="Qualification"
					/>
					<MatchListTab matches={levelBuckets.playoff} open={levelOpen === "playoff"} label="Playoff" />
				</Tabs>
			{/if}
		{/await}
	</div>
</div>
