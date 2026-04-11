<script lang="ts">
	import {
		Checkbox,
		Indicator,
		Table,
		TableBody,
		TableBodyCell,
		TableBodyRow,
		TableHead,
		TableHeadCell,
	} from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import { get } from "svelte/store";
	import type { EventChecklist, NexusStatus } from "../../../shared/types";
	import PitMapModal from "../components/PitMapModal.svelte";
	import Spinner from "../components/Spinner.svelte";
	import { trpc } from "../main";
	import { eventStore } from "../stores/event";
	import { userStore } from "../stores/user";

	let checklist: EventChecklist = $state({});
	let checklistPromise = trpc.checklist.get.query();
	const teamNames: { [key: string]: string } = $state({});

	for (let team of get(eventStore).teams) {
		let name = team.name;
		if (name.length > 20) {
			name = name.slice(0, 20) + "...";
		}

		teamNames[team.number] = name;
	}

	checklistPromise.then((c: EventChecklist) => {
		checklist = c;
		updateTotals(checklist);
	});

	let present = $state(0);
	let weighed = 0;
	let inspected = $state(0);
	let radioProgrammed = $state(0);
	let connectionTested = $state(0);
	let total = $state(0);

	let sortBy: "present" | "inspected" | "radioProgrammed" | "connectionTested" | null = $state(null);

	let sortedEntries = $derived(
		Object.entries(checklist).sort(([teamA, itemsA], [teamB, itemsB]) => {
			if (sortBy !== null) {
				const a = itemsA[sortBy] ? 1 : 0;
				const b = itemsB[sortBy] ? 1 : 0;
				if (a !== b) return a - b;
			}
			return parseInt(teamA) - parseInt(teamB);
		}),
	);

	// Pit map
	let pitMapOpen = $state(false);
	let pitMapTeam = $state("");

	// Nexus status
	let nexusStatus: NexusStatus | null = $state(null);
	let nexusStatusInterval: ReturnType<typeof setInterval> | null = null;

	async function refreshNexusStatus() {
		try {
			nexusStatus = await trpc.event.getNexusStatus.query();
		} catch {
			/* ignore */
		}
	}

	function updateTotals(c: EventChecklist) {
		present = 0;
		weighed = 0;
		inspected = 0;
		radioProgrammed = 0;
		connectionTested = 0;
		total = 0;
		for (let team of Object.values(c)) {
			if (team.present) present++;
			if (team.weighed) weighed++;
			if (team.inspected) inspected++;
			if (team.radioProgrammed) radioProgrammed++;
			if (team.connectionTested) connectionTested++;
			total++;
		}
	}

	async function removeTeam(team: string) {
		await trpc.event.removeTeam.mutate({ teamNumber: team });
		delete checklist[team];
		delete teamNames[team];
		checklist = { ...checklist };
		updateTotals(checklist);
	}

	async function updateChecklist(
		team: string,
		key: "present" | "inspected" | "radioProgrammed" | "connectionTested",
		value: boolean,
	) {
		const updated = [{ team: team, key, value }];

		if (["inspected", "radioProgrammed", "connectionTested"].includes(key) && value) {
			updated.push({ team: team, key: "present", value: true });
		}

		if (key === "connectionTested" && value) {
			updated.push({ team: team, key: "radioProgrammed", value: true });
		}

		await trpc.checklist.update.mutate(updated);
		updateTotals(checklist);
	}

	let subscription: ReturnType<typeof trpc.checklist.subscription.subscribe>;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	async function resubscribe() {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		subscription?.unsubscribe();

		try {
			checklist = await trpc.checklist.get.query();
			updateTotals(checklist);
		} catch { /* ignore */ }

		subscription = trpc.checklist.subscription.subscribe(
			{
				eventToken: $userStore.eventToken,
			},
			{
				onData: (c: EventChecklist) => {
					checklist = c;
					updateTotals(checklist);
				},
				onError: (err) => {
					console.error("Checklist subscription lost, reconnecting in 5s…", err);
					reconnectTimer = setTimeout(() => resubscribe(), 5000);
				},
			},
		);
	}

	onMount(() => {
		resubscribe();

		function handleVisibility() {
			if (document.visibilityState === "visible") resubscribe();
		}
		function handleOnline() {
			resubscribe();
		}

		document.addEventListener("visibilitychange", handleVisibility);
		window.addEventListener("online", handleOnline);

		refreshNexusStatus();
		nexusStatusInterval = setInterval(refreshNexusStatus, 30_000);

		return () => {
			document.removeEventListener("visibilitychange", handleVisibility);
			window.removeEventListener("online", handleOnline);
		};
	});

	onDestroy(() => {
		subscription?.unsubscribe();
		if (reconnectTimer) clearTimeout(reconnectTimer);
		if (nexusStatusInterval) clearInterval(nexusStatusInterval);
	});
</script>

<div class="container w-full flex flex-col h-full mx-auto gap-2 overflow-y-auto">
	{#await checklistPromise}
		<Spinner />
	{:then c}
		<div class="flex w-full justify-center py-2">
			<div class="flex flex-col gap-2">
				<h1 class="font-bold text-3xl">Team Checklist</h1>
				{#if nexusStatus && nexusStatus.state !== "not_configured"}
					<div class="flex flex-row gap-2 justify-center items-center text-sm">
						<Indicator
							color={nexusStatus.state === "complete" || nexusStatus.state === "polling_slow"
								? "green"
								: nexusStatus.state === "polling"
									? "blue"
									: nexusStatus.state === "unauthorized"
										? "red"
										: nexusStatus.state === "error"
											? "yellow"
											: "gray"}
							class="shrink-0"
						/>
						<span class="text-gray-400">
							{#if nexusStatus.state === "polling" || nexusStatus.state === "polling_slow"}
								Nexus syncing
							{:else if nexusStatus.state === "complete"}
								Nexus synced ✓
							{:else if nexusStatus.state === "unauthorized"}
								Nexus: unauthorized
							{:else if nexusStatus.state === "error"}
								Nexus: error
							{:else if nexusStatus.state === "event_over"}
								Nexus: event ended
							{/if}
						</span>
					</div>
				{/if}
				<div class="flex flex-row gap-2 place-content-center">
					<p class="font-bold">Present:</p>
					<p class="">
						{present}/{total}{#if present === total}
							🎉{/if}
					</p>
				</div>
				<div class="flex flex-row gap-2 place-content-center">
					<p class="font-bold">Inspected:</p>
					<p class="">
						{inspected}/{total}{#if inspected === total}
							🎉{/if}
					</p>
				</div>
				<div class="flex flex-row gap-2 place-content-center">
					<p class="font-bold">Radio Programmed:</p>
					<p class="">
						{radioProgrammed}/{total}{#if radioProgrammed === total}
							🎉{/if}
					</p>
				</div>
				<div class="flex flex-row gap-2 place-content-center">
					<p class="font-bold">Connection Tested:</p>
					<p class="">
						{connectionTested}/{total}{#if connectionTested === total}
							🎉{/if}
					</p>
				</div>
			</div>
		</div>
		<table class="text-center pt-2">
			<thead class="sticky top-0 z-20 bg-gray-100 dark:bg-gray-700 font-bold">
				<tr>
					<td class="sticky left-0 z-30 p-1 md:p-2 bg-gray-100 dark:bg-gray-700">Team</td>
					<td class="hidden sm:table-cell p-1 md:p-2">Name</td>
					<td class="p-1 md:p-2">
						<button
							onclick={() => (sortBy = sortBy === "present" ? null : "present")}
							class={sortBy === "present" ? "text-blue-400 font-bold" : "font-bold"}
							>Present <span class={sortBy === "present" ? "" : "opacity-30"}>▲</span></button
						>
					</td>
					<td class="p-1 md:p-2">
						<button
							onclick={() => (sortBy = sortBy === "inspected" ? null : "inspected")}
							class={sortBy === "inspected" ? "text-blue-400 font-bold" : "font-bold"}
							>Inspected <span class={sortBy === "inspected" ? "" : "opacity-30"}>▲</span></button
						>
					</td>
					<td class="p-1 md:p-2">
						<button
							onclick={() => (sortBy = sortBy === "radioProgrammed" ? null : "radioProgrammed")}
							class={sortBy === "radioProgrammed" ? "text-blue-400 font-bold" : "font-bold"}
							>Radio <span class={sortBy === "radioProgrammed" ? "" : "opacity-30"}>▲</span></button
						>
					</td>
					<td class="p-1 md:p-2">
						<button
							onclick={() => (sortBy = sortBy === "connectionTested" ? null : "connectionTested")}
							class={sortBy === "connectionTested" ? "text-blue-400 font-bold" : "font-bold"}
							>Connection <span class={sortBy === "connectionTested" ? "" : "opacity-30"}>▲</span></button
						>
					</td>
				</tr>
			</thead>
			<tbody>
				{#each sortedEntries as [team, items] (team)}
					<tr class="border-b-1 border-gray-600">
						<td class="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 px-6 py-4">
							<button
								class="font-medium hover:underline text-blue-600 dark:text-blue-400"
								onclick={() => {
									pitMapTeam = team;
									pitMapOpen = true;
								}}>{team}</button
							>
						</td>
						<td class="hidden sm:table-cell">{teamNames[team]}</td>
						<td>
							<Checkbox
								class="justify-center"
								bind:checked={items.present}
								onchange={() => updateChecklist(team, "present", items.present)}
							/></td
						>
						<td>
							<Checkbox
								class="justify-center"
								bind:checked={items.inspected}
								onchange={() => updateChecklist(team, "inspected", items.inspected)}
							/></td
						>
						<td>
							<Checkbox
								class="justify-center"
								bind:checked={items.radioProgrammed}
								onchange={() => updateChecklist(team, "radioProgrammed", items.radioProgrammed)}
							/></td
						>
						<td>
							<Checkbox
								class="justify-center"
								bind:checked={items.connectionTested}
								onchange={() => updateChecklist(team, "connectionTested", items.connectionTested)}
							/></td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	{/await}
</div>

<PitMapModal bind:open={pitMapOpen} teamNumber={pitMapTeam} onRemove={removeTeam} />
