<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Badge, Button, Input, Modal } from "flowbite-svelte";
	import type { Note } from "../../../../shared/types";
	import { getContrastTextColor } from "../../util/colorContrast";

	interface SubEventInfo {
		code: string;
		label: string;
		color?: string;
	}

	interface Props {
		open: boolean;
		notes: Note[];
		currentNoteId: string;
		subEvents?: SubEventInfo[];
		mergePending: boolean;
		onmerge: (noteId: string) => void;
	}

	let { open = $bindable(), notes, currentNoteId, subEvents, mergePending, onmerge }: Props = $props();

	let search = $state("");
	let selectedNoteId = $state<string | null>(null);

	$effect(() => {
		if (!open) {
			search = "";
			selectedNoteId = null;
		}
	});

	const otherNotes = $derived(notes.filter((n) => n.id !== currentNoteId));

	const filtered = $derived(
		otherNotes.filter((n) => {
			if (!search.trim()) return true;
			const q = search.toLowerCase();
			return String(n.team ?? "").includes(q) || n.text.toLowerCase().includes(q);
		}),
	);

	function subEventForNote(note: Note): SubEventInfo | undefined {
		return subEvents?.find((se) => se.code === note.event_code);
	}

	function textPreview(text: string): string {
		return text.length > 80 ? text.slice(0, 79) + "…" : text;
	}

	function statusColor(note: Note): "green" | "gray" | "red" {
		if (note.resolution_status === "Open") return "green";
		if (note.resolution_status === "Resolved") return "gray";
		return "red";
	}

	function statusLabel(note: Note): string {
		if (note.resolution_status === "Open") return "Open";
		if (note.resolution_status === "Resolved") return "Resolved";
		if (note.resolution_status === "Refused") return "Refused";
		return "N/A";
	}
</script>

<Modal bind:open size="lg" title="Merge with…">
	<div class="flex flex-col gap-3">
		<Input placeholder="Search by team # or text…" bind:value={search} />

		{#if filtered.length === 0}
			<p class="text-sm text-gray-400 dark:text-gray-500 text-center py-2">No notes found</p>
		{:else}
			<div class="flex flex-col gap-1 max-h-96 overflow-y-auto">
				{#each filtered as n (n.id)}
					{@const sub = subEventForNote(n)}
					<button
						class="flex items-start gap-2 w-full text-left px-3 py-2 rounded-lg
							hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors
							{selectedNoteId === n.id ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}"
						disabled={mergePending}
						onclick={() => (selectedNoteId = selectedNoteId === n.id ? null : n.id)}
					>
						<div class="flex flex-col gap-1 flex-1 min-w-0">
							<div class="flex flex-wrap items-center gap-1.5">
								{#if n.team}
									<span class="text-sm font-bold text-black dark:text-white">Team {n.team}</span>
								{:else}
									<span class="text-xs text-gray-400">No team</span>
								{/if}
								<Badge color={statusColor(n)} class="text-xs">{statusLabel(n)}</Badge>
								{#if sub}
									<span
										class="inline-block px-1.5 py-0.5 rounded text-xs font-medium"
										style="background-color: {sub.color ?? '#6366f1'}; color: {getContrastTextColor(
											sub.color ?? '#6366f1',
										)}">{sub.label}</span
									>
								{/if}
							</div>
							<p class="text-xs text-gray-500 dark:text-gray-400">{textPreview(n.text)}</p>
						</div>
						{#if selectedNoteId === n.id}
							<Icon icon="mdi:check-circle" class="size-5 shrink-0 text-blue-500 mt-0.5" />
						{/if}
					</button>
				{/each}
			</div>
		{/if}

		{#if selectedNoteId}
			<div class="border-t border-gray-200 dark:border-neutral-600 pt-3 flex flex-col gap-2">
				<p class="text-sm text-gray-600 dark:text-gray-300">
					<Icon icon="mdi:alert" class="size-4 inline mr-1 text-orange-400" />
					This note's messages will be moved into the selected note, and this note will be permanently deleted.
				</p>
				<Button color="red" disabled={mergePending} onclick={() => selectedNoteId && onmerge(selectedNoteId)}>
					{#if mergePending}
						Merging…
					{:else}
						<Icon icon="mdi:merge" class="size-4 mr-2" />Merge
					{/if}
				</Button>
			</div>
		{/if}
	</div>
</Modal>
