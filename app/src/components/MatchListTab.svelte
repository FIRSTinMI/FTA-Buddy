<script lang="ts">
	import {
		TabItem,
		TableBody,
		TableBodyCell,
		TableBodyRow,
		TableHead,
		TableHeadCell,
		TableSearch,
	} from "flowbite-svelte";
	import { formatTime } from "../../../shared/formatTime";
	import type { MatchRouterOutputs } from "../../../src/router/logs";
	import { navigate } from "../router";

	let {
		matches,
		label = "Matches",
		open = false,
	}: {
		matches: MatchRouterOutputs["getMatches"];
		label?: string;
		open?: boolean;
	} = $props();

	let searchTerm = $state("");

	let filteredMatches = $derived(
		matches.filter((match) => {
			return (
				match.blue1?.toString().includes(searchTerm) ||
				match.blue2?.toString().includes(searchTerm) ||
				match.blue3?.toString().includes(searchTerm) ||
				match.red1?.toString().includes(searchTerm) ||
				match.red2?.toString().includes(searchTerm) ||
				match.red3?.toString().includes(searchTerm)
			);
		}),
	);

	function tabClick() {
		// Hash navigation not supported by sv-router; update hash directly
		window.location.hash = label.toLowerCase();
	}
</script>

<TabItem class="w-full" disabled={matches.length <= 0} {open} onclick={tabClick} title={label}>
	<TableSearch
		placeholder="Search by team number"
		hoverable={true}
		bind:inputValue={searchTerm}
		class="relative overflow-x-auto rounded-lg bg-neutral-50 dark:bg-neutral-700"
	>
		<TableHead class="text-center bg-neutral-100 dark:bg-neutral-800">
			<TableHeadCell class="hidden md:table-cell">Match</TableHeadCell>
			<TableHeadCell class="hidden md:table-cell">Play</TableHeadCell>
			<TableHeadCell class="md:hidden">M/P</TableHeadCell>
			<TableHeadCell class="hidden md:table-cell">Time</TableHeadCell>
			<TableHeadCell class="hidden md:table-cell">Blue 1</TableHeadCell>
			<TableHeadCell class="hidden md:table-cell">Blue 2</TableHeadCell>
			<TableHeadCell class="hidden md:table-cell">Blue 3</TableHeadCell>
			<TableHeadCell class="hidden md:table-cell">Red 1</TableHeadCell>
			<TableHeadCell class="hidden md:table-cell">Red 2</TableHeadCell>
			<TableHeadCell class="hidden md:table-cell">Red 3</TableHeadCell>
			<TableHeadCell class="px-1 md:hidden">B1</TableHeadCell>
			<TableHeadCell class="px-1 md:hidden">B2</TableHeadCell>
			<TableHeadCell class="px-1 md:hidden">B3</TableHeadCell>
			<TableHeadCell class="px-1 md:hidden">R1</TableHeadCell>
			<TableHeadCell class="px-1 md:hidden">R2</TableHeadCell>
			<TableHeadCell class="px-1 md:hidden">R3</TableHeadCell>
			<TableHeadCell>Logs</TableHeadCell>
		</TableHead>
		<TableBody>
			{#each filteredMatches as match}
				<TableBodyRow class="text-center cursor-pointer">
					<TableBodyCell
						class="dark:bg-neutral-700 hidden md:table-cell"
						onclick={() => navigate("/logs/:matchid", { params: { matchid: match.id } })}
						>{match.match_number}</TableBodyCell
					>
					<TableBodyCell
						class="dark:bg-neutral-700 hidden md:table-cell"
						onclick={() => navigate("/logs/:matchid", { params: { matchid: match.id } })}
						>{match.play_number}</TableBodyCell
					>
					<TableBodyCell
						class="dark:bg-neutral-700 md:hidden"
						onclick={() => navigate("/logs/:matchid", { params: { matchid: match.id } })}
						>{match.match_number}/{match.play_number}</TableBodyCell
					>
					<TableBodyCell
						class="dark:bg-neutral-700 hidden md:table-cell"
						onclick={() => navigate("/logs/:matchid", { params: { matchid: match.id } })}
						>{formatTime(new Date(match.start_time))}</TableBodyCell
					>
					<TableBodyCell
						class="px-1 bg-blue-400 dark:bg-blue-600 hover:bg-opacity-50 hover:underline"
						onclick={() =>
							navigate("/logs/:matchid/:station", { params: { matchid: match.id, station: "blue1" } })}
						>{match.blue1 ?? "None"}{#if match.blue1_has_event}<span class="ml-1">⚙️</span>{/if}{#if match.blue1_bypassed}<span class="ml-1">🚫</span>{/if}</TableBodyCell
					>
					<TableBodyCell
						class="px-1 bg-blue-400 dark:bg-blue-600 hover:bg-opacity-50 hover:underline"
						onclick={() =>
							navigate("/logs/:matchid/:station", { params: { matchid: match.id, station: "blue2" } })}
						>{match.blue2 ?? "None"}{#if match.blue2_has_event}<span class="ml-1">⚙️</span>{/if}{#if match.blue2_bypassed}<span class="ml-1">🚫</span>{/if}</TableBodyCell
					>
					<TableBodyCell
						class="px-1 bg-blue-400 dark:bg-blue-600 hover:bg-opacity-50 hover:underline"
						onclick={() =>
							navigate("/logs/:matchid/:station", { params: { matchid: match.id, station: "blue3" } })}
						>{match.blue3 ?? "None"}{#if match.blue3_has_event}<span class="ml-1">⚙️</span>{/if}{#if match.blue3_bypassed}<span class="ml-1">🚫</span>{/if}</TableBodyCell
					>
					<TableBodyCell
						class="px-1 bg-red-400 dark:bg-red-600 hover:bg-opacity-50 hover:underline"
						onclick={() =>
							navigate("/logs/:matchid/:station", { params: { matchid: match.id, station: "red1" } })}
						>{match.red1 ?? "None"}{#if match.red1_has_event}<span class="ml-1">⚙️</span>{/if}{#if match.red1_bypassed}<span class="ml-1">🚫</span>{/if}</TableBodyCell
					>
					<TableBodyCell
						class="px-1 bg-red-400 dark:bg-red-600 hover:bg-opacity-50 hover:underline"
						onclick={() =>
							navigate("/logs/:matchid/:station", { params: { matchid: match.id, station: "red2" } })}
						>{match.red2 ?? "None"}{#if match.red2_has_event}<span class="ml-1">⚙️</span>{/if}{#if match.red2_bypassed}<span class="ml-1">🚫</span>{/if}</TableBodyCell
					>
					<TableBodyCell
						class="px-1 bg-red-400 dark:bg-red-600 hover:bg-opacity-50 hover:underline"
						onclick={() =>
							navigate("/logs/:matchid/:station", { params: { matchid: match.id, station: "red3" } })}
						>{match.red3 ?? "None"}{#if match.red3_has_event}<span class="ml-1">⚙️</span>{/if}{#if match.red3_bypassed}<span class="ml-1">🚫</span>{/if}</TableBodyCell
					>
					<TableBodyCell
						class="dark:bg-neutral-700 hover:bg-opacity-50 hover:underline"
						onclick={() => navigate("/logs/:matchid", { params: { matchid: match.id } })}
						>View</TableBodyCell
					>
				</TableBodyRow>
			{/each}
		</TableBody>
	</TableSearch>
</TabItem>
