<script lang="ts">
	import { Alert, Button, Label, Select, Textarea, ToolbarButton } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import { get } from "svelte/store";
	import TicketCard from "../../components/TicketCard.svelte";
	import { trpc } from "../../main";
	import { eventStore, type Event } from "../../stores/event";
	import Icon from "@iconify/svelte";
	import { userStore } from "../../stores/user";
	import { toast } from "../../util/toast";
	import { startBackgroundSubscription, stopBackgroundSubscription } from "../../util/notifications";
	import NotesPolicy from "../../components/NotesPolicy.svelte";
	import { settingsStore } from "../../stores/settings";
	import Spinner from "../../components/Spinner.svelte";
    import type { Ticket } from "../../../../shared/types";

	let filterSelected = '';
	let filterOptions = [
		{ value: 'team', name: 'Team Number: ' },
		{ value: 'open', name: 'Open' },
		{ value: 'closed', name: 'Closed' },
		{ value: 'unassigned', name: 'Unassigned' },
		{ value: 'assigned_to', name: 'Assigned to: ' },
	];
	
	export const newTicket = (ticket: any) => {
		console.log(ticket);
	};

	let teamSelected = -1; 

	let teams: Event["teams"] = get(eventStore).teams || [];

	let teamOptions = teams
		.sort((a, b) => parseInt(a.number) - parseInt(b.number))
		.map((v) => ({ value: parseInt(v.number), name: `${v.number} - ${v.name}` }));

	let userSelected = -1;

	let users: Event["users"] = get(eventStore).users || []; 
	
	let userOptions = users
		.sort((a, b) => a.username.localeCompare(b.username))
		.map((v) => ({ value: v.id, name: `${v.username}` }));

	let filteredTickets: Ticket[] | null;

	let tickets: Awaited<ReturnType<typeof trpc.tickets.getAll.query>> = [] as Awaited<ReturnType<typeof trpc.tickets.getAll.query>>;

	let ticketsPromise: Promise<any> | undefined;

	let foregroundSubscription: ReturnType<typeof trpc.tickets.foregroundSubscription.subscribe> | undefined;

	function filterTickets(option: string) {
		if (option === "team" && teamSelected !== -1) {
			filteredTickets = tickets.filter(ticket => ticket.team === teamSelected);
		} else if (option === "team" && teamSelected === -1) {
			filteredTickets = null;
		} else if (option === "open") {
			filteredTickets = tickets.filter(ticket => ticket.is_open === true);
		} else if (option === "closed") {
			filteredTickets = tickets.filter(ticket => ticket.is_open === false);
		} else if (option === "unassigned") {
			filteredTickets = tickets.filter(ticket => ticket.assigned_to_id === -1);
		} else if (option === "assigned_to" && userSelected !== -1) {
			filteredTickets = tickets.filter(ticket => ticket.assigned_to_id === userSelected);
		} else if (option === "assigned_to" && userSelected === -1) {
			filteredTickets = null;
		} else {
			filteredTickets = tickets;
		}
	}

	async function getTickets() {
		ticketsPromise = trpc.tickets.getAll.query();
		tickets = await ticketsPromise;
	}

	function foregroundSubscribe() {
		if (foregroundSubscription) foregroundSubscription.unsubscribe();
		foregroundSubscription = trpc.tickets.foregroundSubscription.subscribe(
			{
				eventToken: get(userStore).eventToken,
			},
			{
				onData: (data) => {
					console.log(data);
					if (data.type === "status" || data.type === "assign") {
						const matchingTicket = tickets.find((t) => t.id === data.data.id);
						if (!matchingTicket) {
							if (data.type === "status") matchingTicket.is_open = data.data.is_open;
							if (data.type === "assign") matchingTicket.assigned_to = data.data.assigned_to;
						}
						tickets = tickets;
					} else if (data.type === "create") {
						getTickets();
					}
				},
			}
		);
	}

	onMount(() => {
		getTickets();
		foregroundSubscribe();
		stopBackgroundSubscription();
	});

	onDestroy(() => {
		if (foregroundSubscription) foregroundSubscription.unsubscribe();
		startBackgroundSubscription();
	});

	let notesPolicyElm: NotesPolicy;
</script>

<NotesPolicy bind:this={notesPolicyElm} />

<div class="container max-w-6xl mx-auto px-2 pt-2 h-full flex flex-col gap-2">
	<div class="flex flex-col overflow-y-auto h-dvh">
		<div class="flex flex-col grow gap-2">
			<h1 class="text-3xl" style="font-weight: bold">Event Tickets</h1>
			<Label>
				Select a Filter Option
				<Select class="mt-2" items={filterOptions} bind:value={filterSelected} />
			</Label>
			{#if filterSelected === 'team'}
				<Label>
					Select a Team
					<Select class="mt-2" items={teamOptions} bind:value={teamSelected} />
				</Label>
			{:else if filterSelected === 'assigned_to'}
				<Label>
					Select a User
					<Select class="mt-2" items={userOptions} bind:value={userSelected} />
				</Label>
			{/if}
		</div>
		<div class="flex flex-col grow gap-2">
			{#await ticketsPromise}
				<Spinner />
			{:then}
				{#if filterSelected !== ''}
					{#if !filteredTickets || filteredTickets.length < 1}
						<div class="text-center">No Tickets Matching Filters</div>
					{:else}
						{#each filteredTickets as ticket}
							<TicketCard {ticket} />
						{/each}
					{/if}
				{:else}
					{#if !tickets || tickets.length < 1}
						<div class="text-center">No Tickets</div>
					{:else}
						{#each tickets as ticket}
							<TicketCard {ticket} />
						{/each}
					{/if}
				{/if}
			{/await}
		</div>
	</div>
</div>
