<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Badge, Button, Label, Modal, Textarea } from "flowbite-svelte";
	import type { ComponentProps } from "svelte";
	import { get } from "svelte/store";
	import { formatTimeNoAgoHourMins } from "../../../shared/formatTime";
	import type { Note } from "../../../shared/types";
	import { trpc } from "../main";
	import { eventStore } from "../stores/event";
	import { userStore } from "../stores/user";
	import { navigate } from "../router";
	import { toast } from "../util/toast";
	import { displayTeam } from "../util/team-name";

	let event = get(eventStore);
	let user = get(userStore);

	interface Props {
		note: Note;
	}

	let { note }: Props = $props();

	let deleteNotePopup = $state(false);

	// svelte-ignore state_referenced_locally
	let time = formatTimeNoAgoHourMins(note.created_at);
	let editNoteView = $state(false);
	// svelte-ignore state_referenced_locally
	let editNoteText = $state(note.text);

	// Keep the edit textarea in sync with live note updates from the subscription
	$effect(() => {
		if (editNoteView) editNoteText = note.text;
	});

	const noteTypeLabel: Record<Note["note_type"], string> = {
		TeamIssue: "Team Note",
		EventNote: "Event Note",
		MatchNote: "Match Note",
	};

	const noteTypeColor: Record<Note["note_type"], ComponentProps<typeof Badge>["color"]> = {
		TeamIssue: "blue",
		EventNote: "yellow",
		MatchNote: "green",
	};

	const ISSUE_TYPE_LABELS: Record<string, string> = {
		RoboRioIssue: "RoboRIO Issue",
		DSIssue: "Driver Station Issue",
		NoRobot: "No Robot",
		RadioIssue: "Radio Issue",
		RobotPwrIssue: "Robot Power Issue",
		OtherRobotIssue: "Other Robot Issue",
		VenueIssue: "Venue Issue",
		ElectricalIssue: "Electrical Issue",
		MechanicalIssue: "Mechanical Issue",
		VolunteerIssue: "Volunteer Issue",
		Other: "Other",
	};

	let isTeamIssue = $derived(note.note_type === "TeamIssue");
	let isOpen = $derived(note.resolution_status === "Open");
	let isResolved = $derived(note.resolution_status === "Resolved");
	let canToggleStatus = $derived(
		isTeamIssue && note.resolution_status !== "NotApplicable" && note.resolution_status !== null,
	);
	let canEditOrDelete = $derived(user.id === note.author_id && note.author_id !== -1);

	async function editNote() {
		try {
			if (editNoteText !== note.text) {
				const res = await trpc.notes.edit.mutate({
					id: note.id,
					new_text: editNoteText,
					event_code: event.code,
				});
				toast("Note edited successfully", "", "green-500");
				editNoteView = false;
			} else {
				toast("No changes", "Edit text before saving");
			}
		} catch (err: any) {
			toast("Error editing note", err.message);
			console.error(err);
			return;
		}
	}

	async function deleteNote() {
		try {
			const res = await trpc.notes.delete.mutate({
				id: note.id,
			});
			toast("Message deleted successfully", "success", "green-500");
			deleteNotePopup = false;
		} catch (err: any) {
			toast("An error occurred while deleting the Message", err.message);
			console.error(err);
			return;
		}
	}

	async function toggleStatus() {
		try {
			const newStatus = isOpen ? "Resolved" : "Open";
			await trpc.notes.updateStatus.mutate({
				id: note.id,
				new_status: newStatus,
				event_code: event.code,
			});
			toast(`Note ${newStatus === "Resolved" ? "resolved" : "reopened"}`, "", "green-500");
		} catch (err: any) {
			toast("Error updating status", err.message);
			console.error(err);
		}
	}
</script>

<Modal bind:open={editNoteView} size="lg" outsideclose>
	{#snippet header()}
		<div>
			<h1 class="text-2xl font-bold text-black dark:text-white place-content-center">Edit Note</h1>
		</div>
	{/snippet}
	<form class="text-left flex flex-col gap-4" onsubmit={editNote}>
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

<a
	href="/notepad/view/{note.id}"
	class="block w-full rounded-xl {isResolved
		? 'bg-gray-100 dark:bg-neutral-800 opacity-60'
		: 'bg-white dark:bg-neutral-700'} shadow-sm hover:shadow-md transition-shadow p-4 text-black dark:text-white no-underline"
>
	<div class="flex flex-col gap-2.5">
		<div class="flex items-start justify-between gap-3">
			<div class="flex items-center flex-wrap gap-1.5 min-w-0">
				{#if note.team !== null}
					<button
						class="font-bold text-base hover:underline"
						onclick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							navigate("/notepad/team/:team", { params: { team: String(note.team) } });
						}}>{displayTeam(note.team)}</button
					>
				{/if}
				{#if note.note_type !== "TeamIssue"}
					<Badge color={noteTypeColor[note.note_type]}>{noteTypeLabel[note.note_type]}</Badge>
				{/if}
				{#if note.match_number !== null}
					<Badge color="teal">
						{note.tournament_level === "Qualification"
							? "Qual"
							: note.tournament_level === "Playoff"
								? "Playoff"
								: (note.tournament_level ?? "")} M{note.match_number}{note.play_number &&
						note.play_number > 1
							? ` P${note.play_number}`
							: ""}
					</Badge>
				{/if}
				{#if note.issue_type && note.issue_type !== "Other"}
					<Badge color="purple">{ISSUE_TYPE_LABELS[note.issue_type] ?? note.issue_type}</Badge>
				{/if}
				{#if canToggleStatus && isOpen}
					<Badge color="green">Open</Badge>
				{:else if canToggleStatus}
					<Badge color="gray">Closed{note.resolved_by ? ` by ${note.resolved_by.username}` : ""}</Badge>
				{/if}
			</div>
			<div class="shrink-0 text-right text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
				<p class="font-medium">{note.event_code}</p>
				<p>{time}</p>
			</div>
		</div>

		<p class="text-sm text-black dark:text-white line-clamp-3 leading-snug">{note.text}</p>

		<div class="flex items-center justify-between gap-2">
			<p class="text-xs text-gray-400 dark:text-gray-500">
				{note.author.username}{note.author.username !== note.author.role ? ` · ${note.author.role}` : ""}
				{#if note.author.source === "FMS"}
					<Badge color="indigo" class="ml-1 text-[10px]">FMS</Badge>
				{:else if note.author.source === "Slack"}
					<Badge color="purple" class="ml-1 text-[10px]">Slack</Badge>
				{/if}
			</p>
			{#if note.assigned_to}
				<Badge color="yellow">Assigned: {note.assigned_to.username}</Badge>
			{:else if canToggleStatus}
				<Badge color="red">Unassigned</Badge>
			{/if}
		</div>

		{#if note.messages && note.messages.length > 0}
			{@const latestMsg = note.messages.reduce((a, b) =>
				new Date(a.created_at).getTime() > new Date(b.created_at).getTime() ? a : b,
			)}
			<div class="rounded-lg text-left bg-gray-50 dark:bg-neutral-600 px-3 py-2 flex items-start gap-2">
				<Icon icon="mdi:reply" class="size-3.5 mt-0.5 text-gray-400 dark:text-gray-500 shrink-0" />
				<div class="min-w-0">
					<span class="text-xs text-left font-semibold text-gray-500 dark:text-gray-400">
						{latestMsg.author?.username ?? "Unknown"}{latestMsg.author?.username !== latestMsg.author?.role
							? ` · ${latestMsg.author?.role}`
							: ""}:
					</span>
					<span class="text-xs text-gray-500 dark:text-gray-400 ml-1 line-clamp-1">{latestMsg.text}</span>
				</div>
				{#if note.messages.length > 1}
					<span class="ml-auto text-xs text-gray-400 dark:text-gray-500 shrink-0">
						{note.messages.length} replies
					</span>
				{/if}
			</div>
		{/if}

		{#if canEditOrDelete || canToggleStatus}
			<div
				role="presentation"
				onclick={(e) => {
					e.preventDefault();
					e.stopPropagation();
				}}
				onkeydown={(e) => {
					e.stopPropagation();
				}}
			>
				{#if canToggleStatus}
					<div class="flex flex-row gap-1 justify-between">
						<Button size="xs" color={isOpen ? "green" : "blue"} onclick={toggleStatus}>
							{isOpen ? "Close" : "Reopen"}
						</Button>

						{#if canEditOrDelete}
							<div class="flex gap-1">
								<Button size="xs" color="alternative" onclick={() => (editNoteView = true)}>
									<Icon icon="mdi:pencil" class="size-3.5" />
								</Button>
								<Button size="xs" color="red" onclick={() => (deleteNotePopup = true)}>
									<Icon icon="mdi:trash-can-outline" class="size-3.5" />
								</Button>
							</div>
						{/if}
					</div>
				{:else if canEditOrDelete}
					<div class="flex flex-row gap-1 justify-end">
						<Button size="xs" color="alternative" onclick={() => (editNoteView = true)}>
							<Icon icon="mdi:pencil" class="size-3.5" />
						</Button>
						<Button size="xs" color="red" onclick={() => (deleteNotePopup = true)}>
							<Icon icon="mdi:trash-can-outline" class="size-3.5" />
						</Button>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</a>
