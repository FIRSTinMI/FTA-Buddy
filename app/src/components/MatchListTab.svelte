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
	<input
		type="text"
		placeholder="Search by team number"
		bind:value={searchTerm}
		class="sticky left-0 w-full px-4 py-2 border-b border-neutral-200 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-700 text-sm focus:outline-none"
	/>
	<div class="relative overflow-x-auto rounded-lg bg-neutral-50 dark:bg-neutral-700">
		<table class="w-full text-center text-sm">
			<thead class="bg-neutral-100 dark:bg-neutral-800">
				<tr>
					<th class="px-4 py-2 hidden md:table-cell sticky left-0 z-10 bg-neutral-100 dark:bg-neutral-800"
						>Match</th
					>
					<th class="px-4 py-2 hidden md:table-cell sticky left-0 z-10 bg-neutral-100 dark:bg-neutral-800"
						>Play</th
					>
					<th class="px-4 py-2 md:hidden sticky left-0 z-10 bg-neutral-100 dark:bg-neutral-800">M/P</th>
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
							class="px-4 py-2 dark:bg-neutral-700 hidden md:table-cell sticky left-0 z-10 bg-neutral-50 dark:bg-neutral-700"
							onclick={() => navigate("/logs/:matchid", { params: { matchid: match.id } })}
							>{match.match_number}</td
						>
						<td
							class="px-4 py-2 dark:bg-neutral-700 hidden md:table-cell sticky left-0 z-10 bg-neutral-50 dark:bg-neutral-700"
							onclick={() => navigate("/logs/:matchid", { params: { matchid: match.id } })}
							>{match.play_number}</td
						>
						<td
							class="px-4 py-2 dark:bg-neutral-700 md:hidden sticky left-0 z-10 bg-neutral-50 dark:bg-neutral-700"
							onclick={() => navigate("/logs/:matchid", { params: { matchid: match.id } })}
							>{match.match_number}/{match.play_number}</td
						>
						<td
							class="px-4 py-2 dark:bg-neutral-700 hidden md:table-cell"
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
								navigate("/logs/:matchid/:station", { params: { matchid: match.id, station: "red1" } })}
							>{match.red1 ?? "None"}{#if match.red1_has_event}<span class="ml-1">⚙️</span
								>{/if}{#if match.red1_bypassed}<span class="ml-1">🚫</span>{/if}</td
						>
						<td
							class="px-1 py-2 bg-red-400 dark:bg-red-600 hover:bg-opacity-50 hover:underline"
							onclick={() =>
								navigate("/logs/:matchid/:station", { params: { matchid: match.id, station: "red2" } })}
							>{match.red2 ?? "None"}{#if match.red2_has_event}<span class="ml-1">⚙️</span
								>{/if}{#if match.red2_bypassed}<span class="ml-1">🚫</span>{/if}</td
						>
						<td
							class="px-1 py-2 bg-red-400 dark:bg-red-600 hover:bg-opacity-50 hover:underline"
							onclick={() =>
								navigate("/logs/:matchid/:station", { params: { matchid: match.id, station: "red3" } })}
							>{match.red3 ?? "None"}{#if match.red3_has_event}<span class="ml-1">⚙️</span
								>{/if}{#if match.red3_bypassed}<span class="ml-1">🚫</span>{/if}</td
						>
						<td
							class="px-4 py-2 dark:bg-neutral-700 hover:bg-opacity-50 hover:underline"
							onclick={() => navigate("/logs/:matchid", { params: { matchid: match.id } })}>View</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</TabItem>
