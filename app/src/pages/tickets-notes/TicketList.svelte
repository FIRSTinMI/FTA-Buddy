<svelte:head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</svelte:head>
<script lang="ts">
	import { Alert, Button, Label, Select, Textarea, ToolbarButton, Modal } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import { get } from "svelte/store";
	import TicketCard from "../../components/TicketCard.svelte";
	import { trpc } from "../../main";
	import { eventStore, type Event } from "../../stores/event";
	import Icon from "@iconify/svelte";
	import { userStore } from "../../stores/user";
	import { toast } from "../../../../shared/toast";
	import NotesPolicy from "../../components/NotesPolicy.svelte";
	import { settingsStore } from "../../stores/settings";
	import Spinner from "../../components/Spinner.svelte";
    import type { Ticket } from "../../../../shared/types";
	import { navigate } from "svelte-routing";


	let createModalOpen = false;

	let filterSelected = '';
	let filterOptions = [
		{ value: 'none', name: 'None' },
		{ value: 'team', name: 'Team Number' },
		{ value: 'open', name: 'Open' },
		{ value: 'closed', name: 'Closed' },
		{ value: 'unassigned', name: 'Unassigned' },
		{ value: 'assigned_to', name: 'Assigned to' },
	];

	let teamSelected = -1; 

	let teams: TeamList = get(eventStore).teams || [];

	let teamOptions = teams
		.sort((a, b) => parseInt(a.number) - parseInt(b.number))
		.map((v) => ({ value: parseInt(v.number), name: `${v.number} - ${v.name}` }));

	let userSelected = -1;

	let users: Event["users"] = get(eventStore).users || []; 
	
	let userOptions = users
		.sort((a, b) => a.username.localeCompare(b.username))
		.map((v) => ({ value: v.id, name: `${v.username}` }));

	let filteredTickets: Ticket[] | null;

	let tickets: Awaited<ReturnType<typeof trpc.tickets.getAllWithMessages.query>> = [] as Ticket[];

	let ticketsPromise: Promise<any> | undefined;

	function filterTickets(option: string) {
		if (option === "team" && teamSelected !== -1) {
			filteredTickets = tickets.filter(ticket => !ticket.team === teamSelected);
		} else if (option === "team" && teamSelected === -1) {
			filteredTickets = null;
		} else if (option === "open") {
			filteredTickets = tickets.filter(ticket => ticket.is_open === true);
		} else if (option === "closed") {
			filteredTickets = tickets.filter(ticket => ticket.is_open === false);
		} else if (option === "unassigned") {
			filteredTickets = tickets.filter(ticket => ticket.assigned_to_id === null);
		} else if (option === "assigned_to" && userSelected !== null) {
			filteredTickets = tickets.filter(ticket => ticket.assigned_to_id === userSelected);
		} else if (option === "assigned_to" && userSelected === null) {
			filteredTickets = null;
		} else if (option === "none") {
			filteredTickets = tickets;
		} else {
			filteredTickets = tickets;
		}
	}

	async function getTickets() {
		ticketsPromise = trpc.tickets.getAllWithMessages.query();
		tickets = await ticketsPromise;
	}

	onMount(() => {
		getTickets();
	});

	let notesPolicyElm: NotesPolicy;
	let open = false;

	let team: number | undefined;
	const event = get(eventStore);

	let matchesPromise: ReturnType<typeof trpc.match.getMatchNumbers.query>;
	let matches: SelectOptionType<string>[] = [];

	let matchId: string | undefined = undefined;

	async function getMatchesForTeam(team: number | undefined) {
		if (team) {
			matchesPromise = trpc.match.getMatchNumbers.query({ team });
			matches = (await matchesPromise).map((match) => ({
				value: match.id,
				name: `${match.level} ${match.match_number}/${match.play_number}`,
			}));
		}
	}

	let disableSubmit = false;

	let ticketSubject: string = "";
	let ticketText: string = "";

	$: {
		disableSubmit = team === undefined || ticketText.length === 0 || ticketSubject.length === 0;
	}

	async function createTicket(evt: Event) {
		if (team === undefined || ticketText.length === 0 || ticketSubject.length === 0) return;

		try {
			if (!$settingsStore.acknowledgedNotesPolicy) {
				await notesPolicyElm.confirmPolicy();
			}

			const res = await trpc.tickets.create.query({
				team: team,
				subject: ticketSubject,
				text: ticketText,
				match_id: matchId,
			});
			toast("Ticket created successfully", "success", "green-500");
			navigate("/app/ticket/" + res.id);
		} catch (err: any) {
			toast("An error occurred while creating the ticket", err.message);
			console.error(err);
			return;
		}
	}

	function back() {
		if (window.history.state === null) {
			navigate("/app/messages");
		} else {
			window.history.back();
		}
	}
</script>

<NotesPolicy bind:this={notesPolicyElm} />

<Modal bind:open={createModalOpen} size="lg" outsideclose dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
    <div slot="header"><h1 class="text-2xl font-bold text-black dark:text-white">Create a Ticket</h1></div>
    <form class="text-left flex flex-col gap-4" on:submit|preventDefault={createTicket}>
		<Label class="w-full text-left">
			Select Team
			<Select class="mt-2" items={teamOptions} bind:value={team} on:change={() => getMatchesForTeam(team)} />
		</Label>

		<Label for="subject">Ticket Subject:</Label>
		<Textarea id="subject" class="w-full" bind:value={ticketSubject} />

		<Label for="text">Ticket Text:</Label>
		<Textarea id="text" class="w-full" rows="5" bind:value={ticketText} />

		{#await matchesPromise then}
			{#if matches.length > 0}
				<Label class="w-full text-left">
					Attach a Match: <span class="text-xs text-gray-600">(optional)</span>
					<Select class="mt-2" items={matches} bind:value={matchId} />
				</Label>
			{/if}
		{/await}
		
		<Button type="submit" disabled={disableSubmit}>Create Ticket</Button>
	</form>
</Modal>

<div class="container max-w-6xl mx-auto px-2 pt-2 h-full flex flex-col gap-2">
	<div class="flex flex-col overflow-y-auto h-dvh">
		<div class="flex flex-col grow gap-2">
			<h1 class="text-3xl mt-2" style="font-weight: bold">Event Tickets</h1>
			<Button class="m-3" on:click={() => (createModalOpen = true)}>Create a New Ticket</Button>
			<Label>
				Select a Filter Option (optional)
				<Select class="mt-2" items={filterOptions} bind:value={filterSelected} on:change={() => filterTickets} />
			</Label>
			{#if filterSelected === 'team'}
				<Label>
					Select a Team
					<Select class="mt-2" items={teamOptions} bind:value={teamSelected} on:change={() => filterTickets}/>
				</Label>
			{:else if filterSelected === 'assigned_to'}
				<Label>
					Select a User
					<Select class="mt-2" items={userOptions} bind:value={userSelected} on:change={() => filterTickets}/>
				</Label>
			{/if}
		</div>
		<div class="flex flex-col grow gap-2 mt-5">
			{#await ticketsPromise}
				<Spinner />
			{:then}
				{#if filterSelected !== '' && filterSelected !== 'none'}
					{#if !filteredTickets || filteredTickets.length < 1}
						<p class="text-center">No Tickets Matching Filters</p>
					{:else}
						<p class="text-center">Tickets Matching Filters</p>

						{#each filteredTickets as ticket}
							<TicketCard {ticket} />
						{/each}
					{/if}
				{:else if filterSelected === 'none' || filterSelected === ''}
					{#if !tickets || tickets.length < 1}
						<p class="text-center">No Tickets</p>
					{:else}
						<p class="text-center">No Tickets</p>
						{#each tickets as ticket}
							<TicketCard {ticket} />
						{/each}
					{/if}
				{/if}
			{/await}
		</div>
	</div>
</div>
