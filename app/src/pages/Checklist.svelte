<script lang="ts">
	import { Checkbox, Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell } from "flowbite-svelte";
	import Spinner from "../components/Spinner.svelte";
	import { trpc } from "../main";
	import type { EventChecklist } from "../../../shared/types";
	import { onDestroy, onMount } from "svelte";
	import { userStore } from "../stores/user";
	import { eventStore } from "../stores/event";
	import { get } from "svelte/store";

	let checklist: EventChecklist = {};
	let checklistPromise = trpc.checklist.get.query();
	const teamNames: { [key: string]: string } = {};

	for (let team of get(eventStore).teams) {
		let name = team.name;
		if (name.length > 20) {
			name = name.slice(0, 20) + "...";
		}

		teamNames[team.number] = name;
	}

	checklistPromise.then((c: EventChecklist) => {
		checklist = c;
	});

	let present = 0;
	let weighed = 0;
	let inspected = 0;
	let radioProgrammed = 0;
	let connectionTested = 0;
	let total = 0;

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

	$: updateTotals(checklist);

	async function updateChecklist(team: string, key: "present" | "inspected" | "radioProgrammed" | "connectionTested", value: boolean) {
		const updated = [{ team: team, key, value }];

		if (["inspected", "radioProgrammed", "connectionTested"].includes(key) && value) {
			updated.push({ team: team, key: "present", value: true });
		}

		if (key === "connectionTested" && value) {
			updated.push({ team: team, key: "radioProgrammed", value: true });
		}

		await trpc.checklist.update.query(updated);
	}

	let subscription: ReturnType<typeof trpc.checklist.subscription.subscribe>;

	onMount(() => {
		subscription?.unsubscribe();

		subscription = trpc.checklist.subscription.subscribe(
			{
				eventToken: $userStore.eventToken,
			},
			{
				onData: (c: EventChecklist) => {
					checklist = c;
					updateTotals(checklist);
				},
			}
		);
	});

	onDestroy(() => {
		subscription?.unsubscribe();
	});
</script>

<div class="container w-full flex flex-col py-2 h-full mx-auto h-fit gap-2">
	{#await checklistPromise}
		<Spinner />
	{:then c}
		<div class="flex w-full justify-center">
			<div class="flex flex-col gap-2">
				<h1 class="font-bold text-3xl">Team Checklist</h1>
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
		<Table class="text-center pt-2">
			<TableHead class="sticky top-0">
				<TableHeadCell class="p-1 md:p-2">Team</TableHeadCell>
				<TableHeadCell class="hidden sm:table-cell p-1 md:p-2">Name</TableHeadCell>
				<TableHeadCell class="p-1 md:p-2">Present</TableHeadCell>
				<TableHeadCell class="p-1 md:p-2">Inspected</TableHeadCell>
				<TableHeadCell class="p-1 md:p-2">Radio</TableHeadCell>
				<TableHeadCell class="p-1 md:p-2">Connection</TableHeadCell>
			</TableHead>
			<TableBody>
				{#each Object.entries(checklist) as [team, items]}
					<TableBodyRow>
						<TableBodyCell>{team}</TableBodyCell>
						<TableBodyCell class="hidden sm:table-cell">{teamNames[team]}</TableBodyCell>
						<TableBodyCell
							><Checkbox
								class="justify-center"
								bind:checked={items.present}
								on:change={() => updateChecklist(team, "present", items.present)}
							/></TableBodyCell
						>
						<TableBodyCell
							><Checkbox
								class="justify-center"
								bind:checked={items.inspected}
								on:change={() => updateChecklist(team, "inspected", items.inspected)}
							/></TableBodyCell
						>
						<TableBodyCell
							><Checkbox
								class="justify-center"
								bind:checked={items.radioProgrammed}
								on:change={() => updateChecklist(team, "radioProgrammed", items.radioProgrammed)}
							/></TableBodyCell
						>
						<TableBodyCell
							><Checkbox
								class="justify-center"
								bind:checked={items.connectionTested}
								on:change={() => updateChecklist(team, "connectionTested", items.connectionTested)}
							/></TableBodyCell
						>
					</TableBodyRow>
				{/each}
			</TableBody>
		</Table>
	{/await}
</div>
