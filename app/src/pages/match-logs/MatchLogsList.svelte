<script lang="ts">
	import { TabItem, Tabs } from "flowbite-svelte";
	import type { MatchRouterOutputs } from "../../../../src/router/logs";
	import MatchListTab from "../../components/MatchListTab.svelte";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";

	const matches = trpc.match.getMatches.query({});

	type MatchList = MatchRouterOutputs["getMatches"];
	type FieldBuckets = { test: MatchList; practice: MatchList; qualification: MatchList; playoff: MatchList };

	const testMatches: MatchList = $state([]);
	const practiceMatches: MatchList = $state([]);
	const qualificationMatches: MatchList = $state([]);
	const playoffMatches: MatchList = $state([]);

	let testOpen = $state(false);
	let practiceOpen = $state(false);
	let qualificationOpen = $state(false);
	let playoffOpen = $state(false);

	// Per-field match buckets for combined (meshed) view
	const fieldMatches = $state<Record<string, FieldBuckets>>({});

	matches.then((data) => {
		for (let match of data) {
			if (match.level === "None") {
				testMatches.push(match);
			} else if (match.level === "Practice") {
				practiceMatches.push(match);
			} else if (match.level === "Qualification") {
				qualificationMatches.push(match);
			} else if (match.level === "Playoff") {
				playoffMatches.push(match);
			}

			// Also bucket by field for combined view
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

		// Allows for returning to the same tab after navigating away
		if (window.location.hash === "#test") {
			testOpen = true;
		} else if (window.location.hash === "#practice") {
			practiceOpen = true;
		} else if (window.location.hash === "#qualification") {
			qualificationOpen = true;
		} else if (window.location.hash === "#playoff") {
			playoffOpen = true;
		} else {
			// Open the highest level that has matches
			if (playoffMatches.length > 0) {
				playoffOpen = true;
			} else if (qualificationMatches.length > 0) {
				qualificationOpen = true;
			} else if (practiceMatches.length > 0) {
				practiceOpen = true;
			} else if (testMatches.length > 0) {
				testOpen = true;
			}
		}
	});

	const tabClasses = {
		active: "p-4 w-full flex-grow text-primary-500 border-b-2 border-primary-500",
		inactive:
			"p-4 w-full text-gray-500 dark:text-gray-400 hover:text-gray-700 focus:ring-4 focus:ring-primary-300 focus:outline-none dark:hover:text-white disabled:cursor-not-allowed disabled:opacity-50",
		content: "mt-4",
	};
</script>

<div class="container mx-auto p-2 w-full h-full overflow-y-auto">
	<h1 class="text-3xl font-bold p-2">Event Match Logs</h1>
	<Tabs tabStyle="none" classes={tabClasses}>
		{#await matches}
			<Spinner />
		{:then _}
			{#if $userStore.meshedEventToken && $userStore.meshedEventToken === $userStore.eventToken && $eventStore.subEvents && $eventStore.subEvents.length > 0}
				<!-- Combined view: outer tab per field, inner tabs for Practice/Qual/Playoff -->
				{#each $eventStore.subEvents as subEvent, i}
					<TabItem class="w-full" open={i === 0} title={subEvent.label}>
						{@const fm = fieldMatches[subEvent.code] ?? { test: [], practice: [], qualification: [], playoff: [] }}
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
			{:else}
				<!-- Single event view -->
				<MatchListTab matches={testMatches} open={testOpen} label="Test" />
				<MatchListTab matches={practiceMatches} open={practiceOpen} label="Practice" />
				<MatchListTab matches={qualificationMatches} open={qualificationOpen} label="Qualification" />
				<MatchListTab matches={playoffMatches} open={playoffOpen} label="Playoff" />
			{/if}
		{/await}
	</Tabs>
</div>
