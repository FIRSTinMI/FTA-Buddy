<script lang="ts">
	import { Badge } from "flowbite-svelte";
	import type { Note } from "../../../../shared/types";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";

	interface MatchSummary {
		level: string | null;
		match_number: number;
		play_number: number;
	}

	interface Props {
		note: Note;
		isOpen: boolean;
		match?: MatchSummary | null;
	}

	let { note, isOpen, match }: Props = $props();
</script>

<div class="flex flex-wrap gap-2 justify-center sm:justify-start">
	{#if isOpen}
		<Badge color="green">Open</Badge>
	{:else if note.resolution_status === "Resolved"}
		<Badge color="gray">Resolved{note.resolved_by ? ` by ${note.resolved_by.username}` : ""}</Badge>
	{:else}
		<Badge color="gray">N/A</Badge>
	{/if}

	{#if match}
		<Badge color="teal">
			{match.level === "Qualification" ? "Qual" : match.level === "Playoff" ? "Playoff" : (match.level ?? "")} M{match.match_number}{match.play_number &&
			match.play_number > 1
				? ` P${match.play_number}`
				: ""}
		</Badge>
	{/if}

	{#if note.issue_type && note.issue_type !== "Other"}
		<Badge color="purple">{note.issue_type}</Badge>
	{/if}

	{#if note.assigned_to}
		<Badge color="yellow">Assigned: {note.assigned_to.username}</Badge>
	{:else}
		<Badge color="red">Unassigned</Badge>
	{/if}

	{#if $userStore.meshedEventToken && $eventStore.subEvents}
		<Badge color="indigo">
			{$eventStore.subEvents.find((e) => e.code === note.event_code)?.label ?? note.event_code}
		</Badge>
	{/if}
</div>
