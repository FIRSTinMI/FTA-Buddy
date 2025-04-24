<script lang="ts">
	import { preventDefault } from 'svelte/legacy';

	import { get } from "svelte/store";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { formatTimeNoAgoHourMins } from "../../../../shared/formatTime";
	import { toast } from "../../../../shared/toast";
	import { eventStore } from "../../stores/event";
	import { ROBOT, type Message, type Profile, type TicketUpdateEvents, type TicketUpdateEventData } from "../../../../shared/types";
	import { Alert, Button, Textarea, ToolbarButton, Modal, Label, type SelectOptionType, Select } from "flowbite-svelte";
	import { EditOutline, ExclamationCircleOutline, TrashBinOutline, ArrowLeftOutline } from "flowbite-svelte-icons";
	import { navigate } from "svelte-routing";
	import { userStore } from "../../stores/user";
	import Icon from "@iconify/svelte";
	import { onDestroy, onMount, tick } from "svelte";
	import { settingsStore } from "../../stores/settings";
	import NotesPolicy from "../../components/NotesPolicy.svelte";
	import MessageCard from "../../components/MessageCard.svelte";

	interface Props {
		id: string;
	}

	let { id }: Props = $props();

	let ticket_id = parseInt(id);

	let event = get(eventStore);
	let user = get(userStore);

	let ticket: Awaited<ReturnType<typeof trpc.tickets.getByIdWithMessages.query>> = $state();

	let ticketPromise: Promise<any> | undefined = $state();

	let match_id: string | undefined | null;

	let matchPromise: Promise<any> | undefined;

	let match: Awaited<ReturnType<typeof trpc.match.getMatch.query>> = $state();

	let time: string = $state("");

	let station: ROBOT | undefined = $state(undefined);

	let assignedToUser = false;

	let sortedMessages: Message[] | undefined = $derived(ticket && ticket.messages ? ticket.messages?.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) : []);

	let deleteTicketPopup = $state(false);

	let editTicketView = $state(false);
	let editTicketText: string = $state();
	let editTicketSubject: string = $state();

	async function getTicketAndMatch() {
		ticketPromise = trpc.tickets.getByIdWithMessages.query({
			id: ticket_id,
			event_code: event.code,
		});
		ticket = await ticketPromise;

		if (ticket) {
			if (ticket.match_id) {
				match_id = ticket.match_id;
				matchPromise = trpc.match.getMatch.query({ id: match_id });
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
						console.log("Unable to assign match station");
						break;
				}
			} else {
				match_id = null;
			}
			time = formatTimeNoAgoHourMins(ticket.created_at);

			assignedToUser = ticket.assigned_to_id === user.id ? true : false;
			editTicketText = ticket.text;
			editTicketSubject = ticket.subject;
		}
	}

	

	onMount(async () => {
		getTicketAndMatch();
		foregroundUpdate();
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
			if (ticket.is_open === true) {
				update = await trpc.tickets.updateStatus.query({ id: ticket.id, new_status: false, event_code: event.code });
			} else {
				update = await trpc.tickets.updateStatus.query({ id: ticket.id, new_status: true, event_code: event.code });
			}
			ticket.is_open = update.is_open;
		} catch (err: any) {
			toast("An error occurred while updating the ticket", err.message);
			console.error(err);
			return;
		}
	}

	async function assignSelf() {
		let update;
		if (!ticket) return;
		assignedToUser = ticket.assigned_to_id === user.id ? true : false;
		try {
			if (ticket.assigned_to_id === user.id) {
				update = await trpc.tickets.unAssign.query({ ticket_id: ticket.id, event_code: event.code });
				assignedToUser = false;
			} else {
				update = await trpc.tickets.assign.query({ id: ticket.id, user_id: user.id, event_code: event.code });
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
		navigate(`/logs/${ticket.match_id}/${station}`);
	}

	function back() {
		if (window.history.state === null) {
			if (user.role === "CSA" || user.role === "RI") {
				navigate("/");
			} else {
				navigate("/tickets/");
			}
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

	let message_text: string = $state("");

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

	async function editTicket() {
		try {
			if (editTicketText !== ticket.text && editTicketSubject !== ticket.subject) {
				const res = await trpc.tickets.edit.query({
					id: ticket_id,
					new_text: editTicketText,
					new_subject: editTicketSubject,
					event_code: event.code,
				});
				toast("Ticket edited successfully", "success", "green-500");
			} else if (editTicketText !== ticket.text) {
				const res = await trpc.tickets.edit.query({
					id: ticket_id,
					new_text: editTicketText,
					event_code: event.code,
				});
				toast("Ticket edited successfully", "success", "green-500");
			} else if (editTicketSubject !== ticket.subject) {
				const res = await trpc.tickets.edit.query({
					id: ticket_id,
					new_subject: editTicketSubject,
					event_code: event.code,
				});
				toast("Ticket edited successfully", "success", "green-500");
			}
		} catch (err: any) {
			toast("An error occurred while editing the Ticket", err.message);
			console.error(err);
			return;
		}
	}

	async function deleteTicket() {
		try {
			if (!ticket.messages || ticket.is_open || !ticket.followers) {
				const res = await trpc.tickets.delete.query({
					id: ticket_id,
					event_code: event.code,
				});
				toast("Ticket deleted successfully", "success", "green-500");
			} else {
				toast("Ticket has messages or followers or is closed", "");
			}
			back();
		} catch (err: any) {
			toast("An error occurred while deleting the Ticket", err.message);
			console.error(err);
			return;
		}
	}

	async function toggleFollowTicket() {
		try {
			if (!ticket.followers.includes(user.id)) {
				const res = await trpc.tickets.follow.query({
					id: ticket_id,
					follow: true,
					event_code: event.code,
				});
				// startBackgroundTicketSubscription(ticket_id);
			} else {
				const res = await trpc.tickets.follow.query({
					id: ticket_id,
					follow: false,
					event_code: event.code,
				});
			}
		} catch (err: any) {
			toast("An error occurred while following the Ticket", err.message);
			console.error(err);
			return;
		}
	}

	let foregroundUpdater: ReturnType<typeof trpc.tickets.pushSubscription.subscribe>;

	function foregroundUpdate() {
		if (foregroundUpdater && typeof foregroundUpdater.unsubscribe === "function") foregroundUpdater.unsubscribe();
		foregroundUpdater = trpc.tickets.updateSubscription.subscribe(
			{
				eventToken: get(userStore).eventToken,
				ticket_id: ticket_id,
				eventOptions: {
					assign: true,
					status: true,
					follow: true,
					add_message: true,
					edit_message: true,
					delete_message: true,
				},
			},
			{
				onData: (data) => {
					//console.log(data);
					if (data.ticket_id === ticket.id) {
						switch (data.kind) {
							case "assign":
								ticket.assigned_to_id = data.assigned_to_id;
								ticket.assigned_to = data.assigned_to;
								break;
							case "status":
								ticket.is_open = data.is_open;
								break;
							case "follow":
								ticket.followers = data.followers;
								break;
							case "add_message":
								if (ticket.messages) {
									ticket.messages.push(data.message);
								} else {
									ticket.messages = [data.message];
								}
								ticket = ticket;
								break;
							case "edit_message":
								if (ticket.messages) {
									let updatedMessages = ticket.messages.map((message) => {
										if (message.id === data.message.id) {
											return { ...message, text: data.message.text };
										}
										return message;
									});
									ticket.messages = updatedMessages;
								}
								break;
							case "delete_message":
								if (ticket.messages) {
									let updatedMessages = ticket.messages.filter((message) => message.id !== data.message_id);
									ticket.messages = updatedMessages;
								}
								break;
							default:
								console.warn(`Unhandled event kind: ${data.kind}`);
								break;
						}
					}
				},
			}
		);
	}

	let notesPolicyElm: NotesPolicy = $state();

	let matchesPromise: ReturnType<typeof trpc.match.getMatchNumbers.query> = $state();
	let matches: SelectOptionType<string>[] = $state([]);

	let matchId: string | undefined = $state(undefined);

	async function getMatchesForTeam(team: number | undefined) {
		if (team) {
			matchesPromise = trpc.match.getMatchNumbers.query({ team });
			matches = (await matchesPromise)
				.sort((a, b) => levelToSort(b.level) - levelToSort(a.level) || b.match_number - a.match_number || b.play_number - a.play_number)
				.map((match) => ({
					value: match.id,
					name: `${match.level} ${match.match_number}/${match.play_number}`,
				}));
		}
	}

	function levelToSort(level: "None" | "Practice" | "Qualification" | "Playoff") {
		switch (level) {
			case "Practice":
				return 1;
			case "Qualification":
				return 2;
			case "Playoff":
				return 3;
			default:
				return 0;
		}
	}

	let matchLogModalOpen = $state(false);

	function openMatchLogSelector() {
		matchLogModalOpen = true;
		getMatchesForTeam(ticket.team);
	}

	function attachMatchLog() {
		if (matchId) {
			trpc.tickets.attachMatchLog.mutate({ ticketId: ticket_id, matchId });
			ticket.match_id = matchId;
			matchLogModalOpen = false;
		}
	}
</script>

<Modal bind:open={editTicketView} size="lg" dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
	{#snippet header()}
		<div >
			<h1 class="text-2xl font-bold text-black dark:text-white place-content-center">Edit Ticket #{ticket_id}</h1>
		</div>
	{/snippet}
	<form class="text-left flex flex-col gap-4" onsubmit={editTicket}>
		<Label for="subject">Edit Subject:</Label>
		<Textarea id="subject" class="w-full" rows="1" bind:value={editTicketSubject} />
		<Label for="text">Edit Text:</Label>
		<Textarea id="text" class="w-full" rows="5" bind:value={editTicketText} />
		<Button type="submit">Save Changes</Button>
	</form>
</Modal>

<Modal bind:open={deleteTicketPopup} size="sm" outsideclose dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
	<div class="text-center">
		<h3 class="mb-5 text-lg">Are you sure you want to delete this Ticket?</h3>
		<h2 class="mb-5 text-sm">Unable to delete Tickets that have attached Messages or followers, or those that have been closed.</h2>
		<Button on:click={deleteTicket} color="red" class="me-2">Yes, I'm sure</Button>
		<Button on:click={() => (deleteTicketPopup = false)}>No, cancel</Button>
	</div>
</Modal>

<Modal bind:open={matchLogModalOpen} size="sm" outsideclose dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
	{#snippet header()}
		<div ><h1 class="text-3xl p-2 font-bold text-black dark:text-white">Create a Ticket</h1></div>
	{/snippet}
	<form class="text-left flex flex-col gap-4" onsubmit={preventDefault(attachMatchLog)}>
		{#await matchesPromise then}
			{#if matches.length > 0}
				<Label class="w-full text-left">
					Attach a Match: <span class="text-xs text-gray-600">(optional)</span>
					<Select class="mt-2" items={matches} bind:value={matchId} />
				</Label>
			{/if}
		{/await}

		<Button type="submit">Attach Match Log</Button>
	</form>
</Modal>

<NotesPolicy bind:this={notesPolicyElm} />

<div class="container max-w-6xl mx-auto px-2 pt-2 h-full flex flex-col gap-2">
	<div class="flex flex-col overflow-hidden gap-2">
		{#await ticketPromise}
			<Spinner />
		{:then}
			{#if !ticket}
				<p class="text-red-500">Ticket not found</p>
			{:else}
				{#if user.id === ticket.author_id}
					<div class="flex flex-row justify-between h-10 gap-1">
						<div class="flex flex-row gap-1">
							<Button on:click={back} class=""><ArrowLeftOutline class="" style="height: 13px; width: 13px;" /></Button>
							{#if !ticket.followers.includes(user.id)}
								<Button on:click={toggleFollowTicket} class=""
									><Icon icon="simple-line-icons:user-following" style="height: 13px; width: 18px; padding-right: 4px;" /> Follow</Button
								>
							{:else}
								<Button on:click={toggleFollowTicket} class=""
									><Icon icon="simple-line-icons:user-unfollow" style="height: 13px; width: 18px; padding-right: 4px;" /> Unfollow</Button
								>
							{/if}
							<Button on:click={() => openMatchLogSelector()}
								>{#if ticket.match_id}Change Match Log{:else}Attach Match Log{/if}</Button
							>
						</div>
						<div class="flex flex-row gap-1">
							<Button on:click={() => location.reload()} class=""><Icon icon="charm:refresh" style="height: 13px; width: 13px;" /></Button>
							<Button on:click={() => (editTicketView = true)} class=""><EditOutline class="" style="height: 13px; width: 13px;" /></Button>
							<Button on:click={() => (deleteTicketPopup = true)} class=""><TrashBinOutline class="" style="height: 13px; width: 13px;" /></Button
							>
						</div>
					</div>
				{:else}
					<div class="flex flex-row justify-between gap-1">
						<div class="flex flex-row h-10 gap-1">
							<Button on:click={back} class=""><ArrowLeftOutline class="" style="height: 13px; width: 13px;" /></Button>
							{#if !ticket.followers.includes(user.id)}
								<Button on:click={toggleFollowTicket} class=""
									><Icon icon="simple-line-icons:user-following" style="height: 13px; width: 18px; padding-right: 4px;" /> Follow</Button
								>
							{:else}
								<Button on:click={toggleFollowTicket} class=""
									><Icon icon="simple-line-icons:user-unfollow" style="height: 13px; width: 18px; padding-right: 4px;" /> Unfollow</Button
								>
							{/if}
							<Button on:click={() => openMatchLogSelector()}
								>{#if ticket.match_id}Change Match Log{:else}Attach Match Log{/if}</Button
							>
						</div>
						<div class="flex flex-row gap-1">
							<Button on:click={() => location.reload()} class=""><Icon icon="charm:refresh" style="height: 13px; width: 13px;" /></Button>
						</div>
					</div>
				{/if}
				<div class="flex flex-col w-full h-full">
					<div>
						<h1 class="text-3xl font-bold p-2">
							Ticket #{ticket_id} -
							{#if ticket.is_open}
								<span class="text-green-500 font-bold">Open</span>
							{:else}
								<span class="font-bold">Closed</span>
							{/if}
						</h1>
					</div>
					<div class="text-left">
						{#if $userStore.meshedEventToken && $eventStore.subEvents}
							<p><b>Field:</b> {$eventStore.subEvents.find((e) => e.code === ticket.event_code)?.label ?? ticket.event_code}</p>
						{/if}
						<p><b>Team:</b> {ticket.team} - {get(eventStore).teams?.find((team) => parseInt(team.number) === ticket.team)?.name ?? "Unknown"}</p>
						<p><b>Created:</b> {time} by {ticket.author.username}</p>
						<p>
							<b>Assigned To:</b>
							{#if !ticket.assigned_to_id}
								Unassigned
							{:else}
								{ticket.assigned_to?.username} - {ticket.assigned_to?.role}
							{/if}
						</p>
						{#if match}
							<p>
								<b>Match:</b>
								{match.level.replace("None", "Test")}
								Match #{match.match_number}/Play #{match.play_number}
								{station}
							</p>
						{/if}
					</div>
					<div class="flex flex-row gap-2 justify-between pt-2 sm:place-content-start">
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
					<div class="flex flex-col gap-2 overscroll-contain overflow-y-auto mt-4 pb-2">
						<div class="text-left text-2xl pt-4 pl-4">
							<p class="font-bold">{ticket.subject}</p>
						</div>
						<div class="text-left p-4">
							<p>{ticket.text}</p>
						</div>
						<div class="flex flex-col pb-12">
							<div class="flex flex-col pb-2" id="chat">
								<div class="flex flex-col gap-2 justify-end">
									{#if !sortedMessages}
										<div class="text-center">No messages</div>
									{:else}
										{#each sortedMessages as message}
											<MessageCard {message} />
										{/each}
									{/if}
								</div>
							</div>
							<div>
								<form class="w-full" onsubmit={preventDefault(postMessage)}>
									<label for="chat" class="sr-only">Add a Message:</label>
									<Alert color="dark" class="px-0 py-2">
										{#snippet icon()}
																			
												<Textarea
													id="chat"
													class="ml-3"
													rows="1"
													placeholder="Your message..."
													on:keydown={sendKey}
													bind:value={message_text}
												/>
												<ToolbarButton type="submit" color="blue" class="rounded-full text-primary-600 dark:text-primary-500">
													<Icon icon="mdi:send" class="w-6 h-8" />
													<span class="sr-only">Send message</span>
												</ToolbarButton>
											
																			{/snippet}
									</Alert>
								</form>
							</div>
						</div>
					</div>
				</div>
			{/if}
		{/await}
	</div>
</div>
