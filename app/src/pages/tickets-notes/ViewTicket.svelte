<script lang="ts">
	import { get } from "svelte/store";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { formatTimeNoAgoHourMins } from "../../../../shared/formatTime";
	import { toast } from "../../../../shared/toast";
	import { eventStore } from "../../stores/event";
	import { ROBOT, type Profile} from "../../../../shared/types";
	import { Alert, Button, Textarea, ToolbarButton } from "flowbite-svelte";
	import { navigate } from "svelte-routing";
	import { userStore } from "../../stores/user";
	import Icon from "@iconify/svelte";
	import { onDestroy, onMount, tick } from "svelte";
	import { settingsStore } from "../../stores/settings";
	import NotesPolicy from "../../components/NotesPolicy.svelte";
    import MessageCard from "../../components/MessageCard.svelte";


	export let id: number;

	let ticket_id = parseInt(id);

	let event = get(eventStore);
	let user = get(userStore);

	let ticket: Awaited<ReturnType<typeof trpc.tickets.getByIdWithMessages.query>>;

	let ticketPromise: Promise<any> | undefined;
	
	let match_id: string | undefined | null;

	let matchPromise: Promise<any> | undefined;

	let match: Awaited<ReturnType<typeof trpc.match.getMatch.query>>;

	let time: string = "";

	let station: ROBOT | undefined = undefined;
	
	let assignedToUser = false;

	async function getTicketAndMatch() {
		ticketPromise = trpc.tickets.getByIdWithMessages.query({
			id: ticket_id,
			event_code: event.code
		});
		ticket = await ticketPromise;

		if (ticket) {
			if (ticket.match_id){
				match_id = ticket.match_id;
				matchPromise = trpc.match.getMatch.query({id: match_id})
				match = await matchPromise;

				switch (ticket.team) {
					case match.red1:
						station = ROBOT.red1;
						break;
					case match.red2:
						station = ROBOT.red2;
						break;
					case match.red3:
						station = ROBOT.red3;
						break;
					case match.blue1:
						station = ROBOT.blue1;
						break;
					case match.blue2:
						station = ROBOT.blue2;
						break;
					case match.blue3:
						station = ROBOT.blue3;
						break;
					default:
						console.log("Unable to assign match station")
						break;
				}
			} else {
				match_id = null;
			}
			time = formatTimeNoAgoHourMins(ticket.created_at);
		}
	}

	onMount(async () => {
		getTicketAndMatch();
		if (ticket){
			assignedToUser = (ticket.assigned_to_id === user.id) ? true : false;
		}
    });

	setInterval(
		() => {
			if (!ticket) return;
			time = formatTimeNoAgoHourMins(ticket?.created_at);
		},
		time.includes("s ") ? 1000 : 60000
	);

	async function changeOpenStatus() {
		let update;
		if (!ticket) return;
		try {
			if (ticket.messages.length > 0){
				if (ticket.is_open === true) {
					update = await trpc.tickets.updateStatus.query({ id: ticket.id, new_status: false, event_code: event.code });
				} else {
					update = await trpc.tickets.updateStatus.query({ id: ticket.id, new_status: true, event_code: event.code });
				}
				ticket.is_open = update.is_open;
			} else {
				toast("Ticket must have at least 1 Added Message to be Closed", "");
			}
		} catch (err: any) {
			toast("An error occurred while updating the ticket", err.message);
			console.error(err);
			return;
		}
	}

	async function assignSelf() {
		let update;
		if (!ticket) return;
		assignedToUser = (ticket.assigned_to_id === user.id) ? true : false;
		try {
			if (ticket.assigned_to_id === user.id) {
				update = await trpc.tickets.unAssign.query({ ticket_id: ticket.id, event_code: event.code});
				assignedToUser = false;
			} else {
				update = await trpc.tickets.assign.query({ id: ticket.id, user_id: user.id, event_code: event.code});
				assignedToUser = true;
			}
		} catch (err: any) {
			toast("An error occurred while updating the ticket", err.message);
			console.error(err);
			return;
		}
	}

	function viewLog() {
		if (!ticket || !ticket.match_id || !station) return;
		navigate(`/app/logs/${ticket.match_id}/${station}`);
	}

	function back() {
		if (window.history.state === null) {
			navigate("/app/");
		} else {
			window.history.back();
		}
	}

	function sendKey(event: KeyboardEvent) {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			postMessage(new SubmitEvent("submit"));
		}
	}

	let message_text: string = "";

	async function postMessage(evt: SubmitEvent) {
		if (message_text.trim().length < 1) {
			toast("Error Sending Message", "Message cannot be empty");
		}

		if (!ticket || !user) return;

		try {
			if (!$settingsStore.acknowledgedNotesPolicy) {
				await notesPolicyElm.confirmPolicy();
			}

			const message = await trpc.tickets.messages.create.query({
				text: message_text.trim(),
				ticket_id: ticket.id,
				event_code: event.code,
			});

			message_text = "";

			ticket = { ...ticket };
		} catch (err: any) {
			toast("An error occurred while sending message", err.message);
		}

		await tick();
		scrollToBottom();
	}

	function scrollToBottom() {
		const chat = document.getElementById("chat");
		if (chat) {
			chat.scrollTo(0, chat.scrollHeight);
		}
	}

	let notesPolicyElm: NotesPolicy;
</script>

<NotesPolicy bind:this={notesPolicyElm} />

<div class="container mx-auto px-2 pt-2 flex flex-col gap-2 max-w-5xl">
	<Button on:click={back} class="w-fit">Back</Button>
	{#await ticketPromise}
		<Spinner />
	{:then}
		{#if !ticket}
			<p class="text-red-500">Ticket not found</p>
		{:else}
			<h1 class="text-3xl font-bold">
				Ticket #{ticket_id} -
				{#if ticket.is_open}
					<span class="text-green-500 font-bold">Open</span>
				{:else}
					<span class="font-bold">Closed</span>
				{/if}
			</h1>
			<div class="text-left">
				<p><b>Team:</b> {ticket.team} - {get(eventStore).teams.find((team) => parseInt(team.number) === ticket.team).name}</p>
				<p><b>Created:</b> {time}</p>
				<p>
					<b>Assigned To:</b>
					{#if !ticket.assigned_to_id}
						Unassigned
					{:else}
						{ticket.assigned_to?.username}
					{/if}
				</p>
				{#if match}
					<p>
						<b>Match:</b> {match.level.replace("None", "Test")}
						{match.match_number}/{match.play_number}
						{station}
					</p>
				{/if}
			</div>
			<div class="flex gap-2">
				<Button size="sm" on:click={() => changeOpenStatus()}>{ticket.is_open ? "Close Ticket" : "Reopen Ticket"}</Button>
				{#if user}
					<Button size="sm" on:click={() => assignSelf()}>
						{#if ticket.assigned_to_id === user.id}
							Unassign
						{:else if ticket.assigned_to_id === null || ticket.assigned_to_id === undefined}
							👀 Claim Ticket
						{:else}
							❌ Already Assigned
						{/if}
					</Button>
				{/if}
				{#if match}
					<Button size="sm" on:click={() => viewLog()}>View Log</Button>
				{/if}
			</div>
			<div class="text-left text-2xl pt-4">
				<p class="font-bold">{ticket.subject}</p>
			</div>
			<div class="text-left">
				<p>{ticket.text}</p>
			</div>
			<div class="flex flex-col overflow-y-auto h-full" id="chat">
				<div class="flex flex-col grow gap-2 justify-end">
					{#if !ticket.messages}
						<div class="text-center">No messages</div>
					{:else}
						{#each ticket.messages as message}
							<MessageCard {message} />
						{/each}
					{/if}
				</div>
			</div>
			<form on:submit|preventDefault={postMessage}>
				<label for="chat" class="sr-only">Add a Message:</label>
				<Alert color="dark" class="px-0 py-2">
					<svelte:fragment slot="icon">
						<Textarea id="chat" class="ml-3" rows="1" placeholder="Your message..." on:keydown={sendKey} bind:value={message_text} />
						<ToolbarButton type="submit" color="blue" class="rounded-full text-primary-600 dark:text-primary-500">
							<Icon icon="mdi:send" class="w-6 h-8" />
							<span class="sr-only">Send message</span>
						</ToolbarButton>
					</svelte:fragment>
				</Alert>
			</form>
		{/if}
	{/await}
</div>
