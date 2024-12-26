<script lang="ts">
	import { Tabs } from "flowbite-svelte";
	import { trpc } from "../../main";
	import MatchListTab from "../../components/MatchListTab.svelte";
	import type { MatchRouterOutputs } from "../../../../src/router/logs";
	import Spinner from "../../components/Spinner.svelte";

	export let toast: (title: string, text: string, color?: string) => void;

	const matches = trpc.match.getMatches.query({});

	const testMatches: MatchRouterOutputs["getMatches"] = [];
	const practiceMatches: MatchRouterOutputs["getMatches"] = [];
	const qualificationMatches: MatchRouterOutputs["getMatches"] = [];
	const playoffMatches: MatchRouterOutputs["getMatches"] = [];

	let testOpen = false;
	let practiceOpen = false;
	let qualificationOpen = false;
	let playoffOpen = false;

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
</script>

<div class="container mx-auto p-2 w-full">
	<Tabs
		tabStyle="none"
		defaultClass="flex"
		activeClasses="p-4 w-full flex-grow text-primary-500 border-b-2 border-primary-500"
		inactiveClasses="p-4 w-full text-gray-500 dark:text-gray-400 hover:text-gray-700 focus:ring-4 focus:ring-primary-300 focus:outline-none dark:hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
		contentClass="mt-4"
	>
		{#await matches}
			<Spinner />
		{:then matches}
			<MatchListTab matches={testMatches} open={testOpen} label="Test" />
			<MatchListTab matches={practiceMatches} open={practiceOpen} label="Practice" />
			<MatchListTab matches={qualificationMatches} open={qualificationOpen} label="Qualification" />
			<MatchListTab matches={playoffMatches} open={playoffOpen} label="Playoff" />
		{/await}
	</Tabs>
</div>
