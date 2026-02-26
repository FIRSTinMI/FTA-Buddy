<script lang="ts">
	import { Button, Modal, Textarea } from "flowbite-svelte";
	import type { TournamentLevel } from "../../../../shared/types";
	import { trpc } from "../../main";
	import { toast } from "../../util/toast";

	interface Props {
		open: boolean;
		teamNumber: number;
		teamName: string;
		alliance: "blue" | "red";
		match_number: number | null | undefined;
		play_number: number | null | undefined;
		level: string | null | undefined;
		onSaved: () => void;
		onClose: () => void;
	}

	let {
		open = $bindable(false),
		teamNumber,
		teamName,
		alliance,
		match_number,
		play_number,
		level,
		onSaved,
		onClose,
	}: Props = $props();

	let noteText = $state("");
	let saving = $state(false);

	// Reset text when modal opens for a new team
	$effect(() => {
		if (open) noteText = "";
	});

	const QUICK_LABELS = [
		"Radio reboot",
		"RIO reboot",
		"Lost comms",
		"Lost power",
		"Driver station issues",
		"Controller issues",
		"Code issues",
		"CAN issues",
		"Unable to drive",
		"BYPASSED - no connection",
		"BYPASSED - no code",
		"BYPASSED - no robot",
	];

	function appendLabel(label: string) {
		const current = noteText.trim();
		if (!current) {
			noteText = label;
		} else if (current.endsWith(label)) {
			// already ends with this label, don't duplicate
		} else {
			noteText = current + "\n" + label;
		}
	}

	async function save() {
		const text = noteText.trim();
		if (!text || saving) return;
		saving = true;
		try {
			await trpc.notes.create.mutate({
				team: teamNumber,
				text,
				note_type: "TeamIssue",
				issue_type: "Other",
				match_number: match_number ?? null,
				play_number: play_number ?? null,
				tournament_level: (level as TournamentLevel) ?? null,
			});
			toast("Note created", "", "green-500");
			noteText = "";
			open = false;
			onSaved();
		} catch (err: any) {
			toast("Error creating note", err.message);
		} finally {
			saving = false;
		}
	}

	function handleClose() {
		open = false;
		onClose();
	}

	let matchLabel = $derived.by(() => {
		if (!match_number) return null;
		const lvl = level === "Qualification" ? "Qual" : level === "Playoff" ? "Playoff" : level;
		return `${lvl} M${match_number}${play_number && play_number > 1 ? ` P${play_number}` : ""}`;
	});
</script>

<Modal bind:open size="md" onclose={handleClose}>
	{#snippet header()}
		<div class="flex items-center gap-2">
			<span class="inline-block w-2.5 h-2.5 rounded-full {alliance === 'blue' ? 'bg-blue-500' : 'bg-red-500'}"
			></span>
			<span class="font-bold">#{teamNumber}{teamName ? ` – ${teamName}` : ""}</span>
			{#if matchLabel}
				<span class="text-sm text-gray-500 font-normal">{matchLabel}</span>
			{/if}
		</div>
	{/snippet}

	<div class="flex flex-wrap gap-1.5 mb-3">
		{#each QUICK_LABELS as label}
			<button
				type="button"
				class="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-700 dark:text-gray-300 transition-colors"
				onclick={() => appendLabel(label)}
			>
				{label}
			</button>
		{/each}
	</div>

	<Textarea
		class="w-full"
		rows={5}
		placeholder="Describe the issue…"
		bind:value={noteText}
		autofocus
		onkeydown={(e: KeyboardEvent) => {
			// Only submit on Ctrl/Cmd+Enter to avoid accidental submission
			if ((e.ctrlKey || e.metaKey) && e.key === "Enter") save();
		}}
	/>
	<p class="mt-1 text-xs text-gray-400">Tip: Ctrl+Enter to save quickly</p>

	{#snippet footer()}
		<Button color="blue" disabled={!noteText.trim() || saving} onclick={save}>
			{saving ? "Saving…" : "Save Note"}
		</Button>
		<Button color="alternative" onclick={handleClose}>Cancel</Button>
	{/snippet}
</Modal>
