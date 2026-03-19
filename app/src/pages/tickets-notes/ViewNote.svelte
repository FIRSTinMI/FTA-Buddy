<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Label, Modal, Select, Textarea, type SelectOptionType } from "flowbite-svelte";
	import { onMount, tick } from "svelte";
	import { get } from "svelte/store";
	import { formatTimeNoAgoHourMins } from "../../../../shared/formatTime";
	import { ROBOT, type Message, type Note, type Profile } from "../../../../shared/types";
	import FormattedTime from "../../components/FormattedTime.svelte";
	import MessageCard from "../../components/MessageCard.svelte";
	import NoteActionBar from "../../components/notes/NoteActionBar.svelte";
	import NoteAssignModal from "../../components/notes/NoteAssignModal.svelte";
	import NoteMatchInfo from "../../components/notes/NoteMatchInfo.svelte";
	import NoteMetaBadges from "../../components/notes/NoteMetaBadges.svelte";
	import NotesPolicy from "../../components/NotesPolicy.svelte";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { navigate, route } from "../../router";
	import { eventStore } from "../../stores/event";
	import { track } from "../../util/telemetry";

	track("note_viewed");
	import { settingsStore } from "../../stores/settings";
	import { userStore } from "../../stores/user";
	import { clearNotificationsForNote } from "../../util/notifications";
	import { toast } from "../../util/toast";

	const { id: noteId } = route.getParams("/notepad/view/:id");

	let event = get(eventStore);
	let user = get(userStore);

	let note: Note | undefined = $state();

	let notePromise: Promise<any> | undefined = $state();

	onMount(() => {
		clearNotificationsForNote(noteId);
	});

	let match_id: string | undefined | null;

	let matchPromise: Promise<any> | undefined;

	let match: Awaited<ReturnType<typeof trpc.match.getMatch.query>> | undefined = $state();

	let station: ROBOT | undefined = $state(undefined);

	let assignedToUser = $derived(note ? note.assigned_to_id === user.id : false);

	let sortedMessages: Message[] = $derived(
		note?.messages
			? note.messages.toSorted((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
			: [],
	);

	let deleteNotePopup = $state(false);

	let editNoteView = $state(false);
	let editNoteText: string = $state("");

	type TBANextMatch = Awaited<ReturnType<typeof trpc.matchEvents.getNextMatchForTeam.query>>;
	let nextMatch: TBANextMatch = $state(null);

	type PlayedMatch = {
		id: string;
		match_number: number;
		play_number: number;
		level: string;
		blue1: number | null;
		blue2: number | null;
		blue3: number | null;
		red1: number | null;
		red2: number | null;
		red3: number | null;
	};
	let playedMatchesSince: PlayedMatch[] = $state([]);

	async function getNoteAndMatch() {
		notePromise = trpc.notes.getByIdWithMessages.query({
			id: noteId,
			event_code: event.code,
		});
		note = await notePromise;

		if (note) {
			if (note.team) {
				trpc.matchEvents.getNextMatchForTeam
					.query({ team_number: note.team })
					.then((m) => {
						nextMatch = m;
					})
					.catch(() => {});
			}
			if (note.note_type === "TeamIssue" && note.team) {
				trpc.match.getMatchesSince
					.query({
						team: note.team,
						since: new Date(note.created_at),
						exclude_match_id: note.match_id ?? undefined,
					})
					.then((ms) => {
						playedMatchesSince = ms;
					})
					.catch(() => {});
			}
			if (note.match_id) {
				match_id = note.match_id;
				matchPromise = trpc.match.getMatch.query({ id: match_id });
				match = await matchPromise;

				if (!match) {
					console.error("Match not found for note");
					return;
				}

				switch (note.team) {
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
			// assignedToUser = note.assigned_to_id === user.id ? true : false;
			editNoteText = note.text;
		}
	}

	onMount(async () => {
		getNoteAndMatch();
		foregroundUpdate();
	});

	const isOpen = $derived(note?.resolution_status === "Open");

	async function changeOpenStatus() {
		if (!note) return;
		try {
			const newStatus = isOpen ? "Resolved" : "Open";
			const update = await trpc.notes.updateStatus.mutate({
				id: note.id,
				new_status: newStatus,
				event_code: event.code,
			});
			note.resolution_status = update.resolution_status;
		} catch (err: any) {
			toast("An error occurred while updating the note", err.message);
			console.error(err);
		}
	}

	async function assignSelf() {
		if (!note) return;
		try {
			if (note.assigned_to_id === user.id) {
				await trpc.notes.unAssign.mutate({ note_id: note.id, event_code: event.code });
			} else {
				await trpc.notes.assign.mutate({ id: note.id, user_id: user.id, event_code: event.code });
			}
		} catch (err: any) {
			toast("An error occurred while updating the note", err.message);
			console.error(err);
		}
	}

	let assignModalOpen = $state(false);
	let eventUsers = $state<Profile[]>([]);
	let assignPending = $state(false);

	async function openAssignModal() {
		assignModalOpen = true;
		try {
			eventUsers = await trpc.event.getUsers.query();
		} catch (err: any) {
			toast("Could not load event users", err.message);
		}
	}

	async function assignTo(userId: number | null) {
		if (!note) return;
		assignPending = true;
		try {
			if (userId === null) {
				await trpc.notes.unAssign.mutate({ note_id: note.id, event_code: event.code });
			} else {
				await trpc.notes.assign.mutate({ id: note.id, user_id: userId, event_code: event.code });
			}
			assignModalOpen = false;
		} catch (err: any) {
			toast("An error occurred while assigning the note", err.message);
			console.error(err);
		} finally {
			assignPending = false;
		}
	}

	function viewLog() {
		if (!note || !note.match_id || !station) return;
		navigate("/logs/:matchid/:station", { params: { matchid: note.match_id, station } });
	}

	function back() {
		if (window.history.length <= 1) {
			navigate("/notepad");
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
		evt.preventDefault();
		if (message_text.trim().length < 1) {
			toast("Error Sending Message", "Message cannot be empty");
		}

		if (!note || !user) return;

		try {
			if (!$settingsStore.acknowledgedNotesPolicy) {
				await notesPolicyElm?.confirmPolicy();
			}

			await trpc.notes.messages.create.mutate({
				text: message_text.trim(),
				note_id: note.id,
				event_code: event.code,
			});

			message_text = "";
			note = { ...note };
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

	async function openEditNote() {
		if (!note) return;
		editNoteText = note.text;
		matchIdVal = note.match_id ?? undefined;
		await getMatchesForTeam(note.team);
		editNoteView = true;
	}

	async function editNote(evt: SubmitEvent) {
		evt.preventDefault();
		try {
			if (!note) return;
			if (editNoteText !== note.text || matchIdVal !== (note.match_id ?? undefined)) {
				await trpc.notes.edit.mutate({
					id: noteId,
					new_text: editNoteText,
					event_code: event.code,
					match_id: matchIdVal,
				});
				note = {
					...note,
					text: editNoteText,
					match_id: matchIdVal ?? null,
				};
				// Refresh match display if match_id changed
				if (matchIdVal) {
					match = await trpc.match.getMatch.query({ id: matchIdVal });
					station = undefined;
					if (match && note.team) {
						if (note.team === match.red1) station = ROBOT.red1;
						else if (note.team === match.red2) station = ROBOT.red2;
						else if (note.team === match.red3) station = ROBOT.red3;
						else if (note.team === match.blue1) station = ROBOT.blue1;
						else if (note.team === match.blue2) station = ROBOT.blue2;
						else if (note.team === match.blue3) station = ROBOT.blue3;
					}
				} else {
					match = undefined;
					station = undefined;
				}
				toast("Note edited successfully", "", "green-500");
			}
			editNoteView = false;
		} catch (err: any) {
			toast("An error occurred while editing the Note", err.message);
			console.error(err);
		}
	}

	async function deleteNote() {
		try {
			if (!note) return;
			await trpc.notes.delete.mutate({ id: noteId });
			toast("Note deleted successfully", "success", "green-500");
			// back();
		} catch (err: any) {
			toast("An error occurred while deleting the Note", err.message);
			console.error(err);
		}
	}

	async function toggleFollowNote() {
		try {
			if (!note) return;
			if (!note.followers.includes(user.id)) {
				await trpc.notes.follow.mutate({ id: noteId, follow: true, event_code: event.code });
			} else {
				await trpc.notes.follow.mutate({ id: noteId, follow: false, event_code: event.code });
			}
		} catch (err: any) {
			toast("An error occurred while following the Note", err.message);
			console.error(err);
		}
	}

	let foregroundUpdater: ReturnType<typeof trpc.notes.updateSubscription.subscribe>;

	function foregroundUpdate() {
		if (foregroundUpdater && typeof foregroundUpdater.unsubscribe === "function") foregroundUpdater.unsubscribe();
		foregroundUpdater = trpc.notes.updateSubscription.subscribe(
			{
				eventToken: get(userStore).eventToken,
				source: `${get(userStore).username}.note.${noteId}`,
				note_id: noteId,
				eventOptions: {
					edit: true,
					delete: true,
					status: true,
					assign: true,
					follow: true,
					add_message: true,
					edit_message: true,
					delete_message: true,
				},
			},
			{
				onData: (data) => {
					if (!note) return;

					switch (data.kind) {
						case "edit":
							if (data.note.id === note.id) {
								note = { ...note, text: data.note.text };
							}
							break;
						case "delete":
							if (data.note.id === note.id) {
								toast("This note has been deleted", "");
								back();
							}
							break;
						case "status":
							if (data.note_id === note.id) {
								note = {
									...note,
									resolution_status: data.resolution_status as any,
									resolved_by: data.resolved_by,
								};
							}
							break;
						case "assign":
							if (data.note_id === note.id) {
								note = { ...note, assigned_to_id: data.assigned_to_id, assigned_to: data.assigned_to };
							}
							break;
						case "follow":
							if (data.note_id === note.id) {
								note = { ...note, followers: data.followers };
							}
							break;
						case "add_message":
							if (data.note_id === note.id) {
								const nextMessages = [...(note.messages ?? []), data.message];
								note = { ...note, messages: nextMessages };
							}
							break;
						case "edit_message":
							if (data.note_id === note.id && note.messages) {
								note = {
									...note,
									messages: note.messages.map((m) =>
										m.id === data.message.id ? { ...m, text: data.message.text } : m,
									),
								};
							}
							break;
						case "delete_message":
							if (data.note_id === note.id && note.messages) {
								note = { ...note, messages: note.messages.filter((m) => m.id !== data.message_id) };
							}
							break;
						default:
							break;
					}
				},
			},
		);
	}

	let notesPolicyElm: NotesPolicy | undefined = $state();

	let matchesPromise: ReturnType<typeof trpc.match.getMatchNumbers.query> | undefined = $state();
	let matches: SelectOptionType<string>[] = $state([]);

	let matchIdVal: string | undefined = $state(undefined);

	async function getMatchesForTeam(team: number | null | undefined) {
		if (team) {
			matchesPromise = trpc.match.getMatchNumbers.query({ team });
			const result = await matchesPromise;

			matches = result
				.toSorted(
					(a, b) =>
						levelToSort(b.level) - levelToSort(a.level) ||
						b.match_number - a.match_number ||
						b.play_number - a.play_number,
				)
				.map((m) => ({
					value: m.id,
					name: `${m.level} ${m.match_number}/${m.play_number}`,
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
</script>

<Modal bind:open={editNoteView} size="lg">
	{#snippet header()}
		<div>
			<h1 class="text-2xl font-bold text-black dark:text-white place-content-center">Edit Note</h1>
		</div>
	{/snippet}
	<form class="text-left flex flex-col gap-4" onsubmit={editNote}>
		{#await matchesPromise then}
			{#if matches.length > 0}
				<Label class="w-full text-left">
					Select Match: <span class="text-xs text-gray-600">(optional)</span>
					<Select
						class="mt-2"
						items={[{ value: undefined, name: "- None -" }, ...matches]}
						bind:value={matchIdVal}
					/>
				</Label>
			{/if}
		{/await}

		<Label for="text">Edit Text:</Label>
		<Textarea id="text" class="w-full" rows={5} bind:value={editNoteText} />
		<Button type="submit">Save Changes</Button>
	</form>
</Modal>

<Modal bind:open={deleteNotePopup} size="sm" outsideclose>
	<div class="text-center">
		<h3 class="mb-5 text-lg">Are you sure you want to delete this Note?</h3>
		<Button onclick={deleteNote} color="red" class="me-2">Yes, I'm sure</Button>
		<Button onclick={() => (deleteNotePopup = false)}>No, cancel</Button>
	</div>
</Modal>

<NotesPolicy bind:this={notesPolicyElm} />

<div class="container max-w-6xl mx-auto px-2 pt-2 h-full flex flex-col gap-2">
	<div class="flex flex-col h-full overflow-hidden gap-2">
		{#await notePromise}
			<Spinner />
		{:then}
			{#if !note}
				<p class="text-red-500">Note not found</p>
			{:else}
				<div class="flex flex-col flex-1 min-h-0 overflow-hidden gap-2 px-4">
					<!-- Action bar -->
					<NoteActionBar
						{note}
						userId={user.id}
						isOwner={user.id === note.author_id}
						{isOpen}
						hasMatch={!!match}
						onback={back}
						ontogglefollow={toggleFollowNote}
						onchangestatus={changeOpenStatus}
						onassignself={assignSelf}
						onopeneditnote={openEditNote}
						ondelete={() => (deleteNotePopup = true)}
						onopenassignmodal={openAssignModal}
						onviewlog={viewLog}
					/>

					<!-- Scrollable content -->
					<div class="flex flex-col flex-1 min-h-0 overflow-y-auto gap-3">
						<!-- Note type header + played-since + team + next match -->
						<NoteMatchInfo {note} {nextMatch} {playedMatchesSince} />

						<!-- Created at + author -->
						<div
							class="justify-center text-center sm:justify-start sm:text-left text-xs text-gray-400 dark:text-gray-500"
						>
							<FormattedTime date={note.created_at} formatter={formatTimeNoAgoHourMins} /> ago by {note
								.author.username}
						</div>

						<!-- Status / match / assignment badges -->
						<NoteMetaBadges {note} {isOpen} {match} />

						<!-- Note text -->
						<div class="border-b border-gray-400 dark:border-gray-700 py-3">
							<p
								class="text-center sm:text-left text-black dark:text-white whitespace-pre-wrap leading-relaxed"
							>
								{note.text}
							</p>
						</div>

						<!-- Thread messages -->
						<div class="flex flex-col gap-2" id="chat">
							{#if !sortedMessages || sortedMessages.length === 0}
								<p class="text-center text-xs text-gray-400 dark:text-gray-500 py-2">No replies yet</p>
							{:else}
								{#each sortedMessages as message}
									<MessageCard {message} />
								{/each}
							{/if}
						</div>
					</div>

					<!-- Reply form -->
					<div class="w-full rounded-xl bg-white dark:bg-neutral-800 shadow-sm py-3 mt-1">
						<form class="flex flex-row gap-2 w-full" style="width: 100%" onsubmit={postMessage}>
							<label for="chat-input" class="sr-only">Reply</label>
							<div class="flex-1 min-w-0 [&_textarea]:w-full">
								<Textarea
									id="chat-input"
									class="flex-1 min-w-0"
									rows={2}
									placeholder="Write a reply…"
									onkeydown={sendKey}
									bind:value={message_text}
								/>
							</div>
							<div class="flex flex-none items-center">
								<Button type="submit" size="sm" color="blue" disabled={!message_text.trim()}>
									<Icon icon="mdi:send" class="size-4" />
								</Button>
							</div>
						</form>
					</div>
				</div>
			{/if}
		{/await}
	</div>
</div>

<!-- Assign-to modal -->
<NoteAssignModal
	bind:open={assignModalOpen}
	assignedToId={note?.assigned_to_id}
	{eventUsers}
	{assignPending}
	onassign={assignTo}
/>
