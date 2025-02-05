<script lang="ts">
	import { Button, Input, Label, Modal, Select, Textarea, Toggle, type SelectOptionType } from "flowbite-svelte";
	import { SearchOutline } from "flowbite-svelte-icons";
	import { onMount } from "svelte";
	import { navigate } from "svelte-routing";
	import { toast } from "../../../../shared/toast";
	import type { Ticket } from "../../../../shared/types";
	import NotesPolicy from "../../components/NotesPolicy.svelte";
	import Spinner from "../../components/Spinner.svelte";
	import TicketCard from "../../components/TicketCard.svelte";
	import { trpc } from "../../main";
	import { settingsStore } from "../../stores/settings";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";
	import { clearNotifications } from "../../stores/notifications";
    import Icon from "@iconify/svelte";

	let createModalOpen = false;

	const teamNames = Object.fromEntries($eventStore.teams.map((team) => [team.number, team.name]));

	let teamOptions = $eventStore.teams
		.sort((a, b) => parseInt(a.number) - parseInt(b.number))
		.map((team) => ({ value: team.number, name: `${team.number} - ${team.name}` }));

	let search: string = "";
	let filterSelected = "all";
	let filterOptions = [
		{ value: "all", name: "All" },
		{ value: "open", name: "Open" },
		{ value: "closed", name: "Closed" },
		{ value: "unassigned", name: "Unassigned" },
	];

	let filteredTickets: Ticket[] = [];

	let tickets: Awaited<ReturnType<typeof trpc.tickets.getAllWithMessages.query>> = [] as Ticket[];

	let ticketsPromise: Promise<any> | undefined;

	function filterAndSearchTickets(tickets: Ticket[], filterSelected: string, search: string) {
		if (filterSelected !== "all") {
			tickets = tickets.filter((ticket) => {
				if (filterSelected === "open") {
					return ticket.is_open;
				} else if (filterSelected === "closed") {
					return !ticket.is_open;
				} else if (filterSelected === "unassigned") {
					return !ticket.assigned_to_id;
				}
			});
		}

		if (search.length > 0) {
			const tokenized = search.toLowerCase().split(" ");

			tickets = tickets.filter((ticket) => {
				return tokenized.every(
					(token) =>
						ticket.team.toString().includes(token) ||
						teamNames[ticket.team].toLowerCase().includes(token) ||
						ticket.subject.toLowerCase().includes(token) ||
						(ticket.assigned_to && ticket.assigned_to.username.toLowerCase().includes(token))
				);
			});
		}

		filteredTickets = tickets.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
	}

	$: filterAndSearchTickets(tickets, filterSelected, search);

	async function getTickets() {
		//console.log($userStore.eventToken);
		ticketsPromise = trpc.tickets.getAllWithMessages.query();
		tickets = await ticketsPromise;
	}

	// If the eventToken changes, we need to refetch the tickets and update the subscription
	let eventToken = $userStore.eventToken;
	userStore.subscribe((value) => {
		if (value.eventToken !== eventToken) {
			eventToken = value.eventToken;
			getTickets();
			ticketUpdateSubscription();
		}
	});

	let publicTicketsModalOpen = false;

	let publicTicketSubmitState: boolean;

	let eventPromise: ReturnType<typeof trpc.event.getPublicTicketSubmit.query>;

	async function getPublicTicketCreationState() {
		eventPromise = trpc.event.getPublicTicketSubmit.query();
		publicTicketSubmitState = await eventPromise;
	}

	async function setPublicTicketCreationState() {
		let res: ReturnType<typeof trpc.event.togglePublicTicketSubmit.query>;
		try {
			res = trpc.event.togglePublicTicketSubmit.query({ state: publicTicketSubmitState });
			toast("Status updated successfully", "success", "green-500");
		} catch (err: any) {
			toast("An error occurred while updating the Public Ticket Submit State", err.message);
			console.error(err);
			return;
		}
	}

	function printPublicTicketSubmissionQRCode(event_code: string) {
		// Open a new blank tab
		const newTab = window.open("", "_blank");
		if (!newTab) {
			alert("Popup blocked! Please allow popups for this site.");
			return;
		}

		// Create a document inside the new tab
		const doc = newTab.document;

		// Create a container div
		const container = doc.createElement("div");
		container.style.display = "flex";
		container.style.flexDirection = "column";
		container.style.alignItems = "center";
		container.style.justifyContent = "center";
		container.style.height = "100vh";

		// Create a heading
		const heading = doc.createElement("h1");
		heading.textContent = "Submit CSA Ticket";
		heading.style.fontSize = "3rem";
		heading.style.marginBottom = "10px";
		heading.style.fontFamily = "Arial, sans-serif";

		const subHeading = doc.createElement("h2");
		subHeading.textContent = `For Event: ${event_code}`;
		subHeading.style.fontSize = "2rem";
		subHeading.style.marginTop = "0";
		subHeading.style.marginBottom = "20px";
		subHeading.style.fontFamily = "Arial, sans-serif";

		// Create the QR code image
		const qrCodeImg = doc.createElement("img");
		qrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=http://ftabuddy.com/app/submit-ticket/${$eventStore.code}`;
		qrCodeImg.style.width = "200px";
		qrCodeImg.style.height = "200px";
		qrCodeImg.style.border = "2px solid black";
		qrCodeImg.style.padding = "10px";

		// Append elements to container
		container.appendChild(heading);
		container.appendChild(subHeading);
		container.appendChild(qrCodeImg);

		// Append container to body
		doc.body.appendChild(container);

		// Wait for the QR code to load before opening print dialog
		qrCodeImg.addEventListener("load", () => {
			newTab.print();
		});
	}

	onMount(() => {
		getTickets();
		ticketUpdateSubscription();
		getPublicTicketCreationState();
		if ($userStore.role === "FTA" || $userStore.role === "FTAA") clearNotifications();
	});

	let notesPolicyElm: NotesPolicy;

	let team: number | undefined;

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
		disableSubmit = team === undefined || typeof team === "string" || ticketText.length === 0 || ticketSubject.length === 0;
	}

	async function createTicket(evt: SubmitEvent) {
		if (team === undefined || typeof team === "string" || ticketText.length === 0 || ticketSubject.length === 0) return;

		try {
			if (!$settingsStore.acknowledgedNotesPolicy) {
				await notesPolicyElm.confirmPolicy();
			}

			let res;
			if (matchId) {
				res = await trpc.tickets.create.query({
					team: team,
					subject: ticketSubject,
					text: ticketText,
					match_id: matchId,
				});
			} else {
				res = await trpc.tickets.create.query({
					team: team,
					subject: ticketSubject,
					text: ticketText,
					match_id: undefined,
				});
			}
			toast("Ticket created successfully", "success", "green-500");
			navigate("/app/ticket/" + res.id);
		} catch (err: any) {
			toast("An error occurred while creating the ticket", err.message);
			console.error(err);
			return;
		}
	}

	let subscription: ReturnType<typeof trpc.tickets.updateSubscription.subscribe>;

	function ticketUpdateSubscription() {
		if (subscription) subscription.unsubscribe();

		subscription = trpc.tickets.updateSubscription.subscribe(
			{
				eventToken: $userStore.eventToken,
			},
			{
				onError: console.error,
				onData: (data) => {
					//console.log(data);
					// Want to avoid having to refetch everything if we can
					//getTickets();
					const ticket = tickets.find((t) => t.id === data.ticket_id);
					switch (data.kind) {
						case "status":
							if (ticket) {
								ticket.is_open = data.is_open;
								ticket.updated_at = new Date();
							}
							break;
						case "create":
							tickets.push(data.ticket);
							tickets = tickets;
							break;
						case "edit":
							if (ticket) {
								ticket.subject = data.ticket_subject;
								ticket.text = data.ticket_text;
								ticket.updated_at = data.ticket_updated_at;
							}
							break;
						case "assign":
							if (ticket) {
								ticket.assigned_to = data.assigned_to;
								ticket.assigned_to_id = data.assigned_to_id;
								ticket.updated_at = new Date();
							}
							break;
						case "follow":
							break;
						case "delete_ticket":
							tickets = tickets.filter((t) => t.id !== data.ticket_id);
							break;
						case "add_message":
							if (ticket) {
								if (!ticket.messages) ticket.messages = [];
								ticket.messages?.push(data.message);
								ticket.updated_at = new Date();
							}
							break;
						case "edit_message":
							if (ticket && ticket.messages) {
								const message = ticket.messages.find((m) => m.id === data.message.id);
								if (message) {
									message.text = data.message.text;
									message.updated_at = data.message.updated_at;
								}
								ticket.updated_at = new Date();
							}
							break;
						case "delete_message":
							if (ticket && ticket.messages) {
								ticket.messages = ticket.messages.filter((m) => m.id !== data.message_id);
								ticket.updated_at = ticket.messages.length > 0 ? ticket.messages[ticket.messages.length - 1].updated_at : new Date();
							}
							break;
					}
					tickets = tickets;
					//console.log(tickets);
				},
			}
		);
	}
</script>

<NotesPolicy bind:this={notesPolicyElm} />

<Modal bind:open={createModalOpen} size="lg" outsideclose dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
	<div slot="header"><h1 class="text-3xl p-2 font-bold text-black dark:text-white">Create a Ticket</h1></div>
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

<Modal bind:open={publicTicketsModalOpen} size="sm" outsideclose dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
	<h1 class="text-2xl font-bold">Public Ticket Creation</h1>
	<Button on:click={() => printPublicTicketSubmissionQRCode($eventStore.code)}>Print QR Code</Button>
	<p>If the Public Ticket Creation page is being abused or spammed, please turn this setting off and inform your event FTA that you have done so.</p>
	<Toggle class="toggle place-content-center" bind:checked={publicTicketSubmitState} on:change={setPublicTicketCreationState}
		>Public Ticket Creation: {publicTicketSubmitState ? "ON" : "OFF"}</Toggle
	>
</Modal>

<div class="container max-w-6xl mx-auto px-2 h-full flex flex-col gap-2">
	<div class="fixed top-12 right-2">
		<Button on:click={() => location.reload()} class=""><Icon icon="charm:refresh" style="height: 13px; width: 13px;" /></Button>
	</div>
	<div class="flex flex-col overflow-hidden h-full gap-2">
		<h1 class="text-3xl mt-2 font-bold p-2">Event Tickets</h1>
		<div class="flex flex-row gap-2 max-w-3xl w-full items-center mx-auto">
			<Button class="mx-auto grow" on:click={() => (createModalOpen = true)}>Create a New Ticket</Button>
			<Button class="mx-auto w-fit text-nowrap" on:click={() => (publicTicketsModalOpen = true)}><Icon icon="ic:baseline-settings" class="h-5" /></Button>
		</div>
		<div class="flex items-center gap-2 max-w-3xl w-full mx-auto">
			<Label class="w-full text-left">
				<span class="ml-2">Search</span>
				<Input class="w-full" placeholder="Search Team #, Team Name, Subject, Assigned User" bind:value={search}>
					<SearchOutline slot="left" class="size-5 text-gray-500 dark:text-gray-400" />
				</Input>
			</Label>
			<Label class="text-left">
				<span class="ml-2">Filter</span>
				<Select class="w-fit" items={filterOptions} bind:value={filterSelected} />
			</Label>
		</div>
		<div class="flex flex-col gap-2 overflow-y-auto mt-4 pb-2">
			{#await ticketsPromise}
				<Spinner />
			{:then}
				{#if !filteredTickets || filteredTickets.length < 1}
					<p class="text-center">No Tickets</p>
				{:else}
					{#each filteredTickets as ticket}
						<TicketCard {ticket} />
					{/each}
				{/if}
			{/await}
		</div>
	</div>
</div>
