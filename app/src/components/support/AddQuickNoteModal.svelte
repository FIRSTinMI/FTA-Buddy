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
	let issueType = $state<FTAEventNoteIssueType | null>(null);
	let selectedLabel = $state<string | null>(null);

	// Reset text when modal opens for a new team
	$effect(() => {
		if (open) {
			noteText = "";
			issueType = null;
			selectedLabel = null;
		}
	});

	import type { FTAEventNoteIssueType } from "../../../../shared/fmsApiTypes";

	const QUICK_LABELS: { label: string; issueType: FTAEventNoteIssueType }[] = [
		{ label: "Radio reboot", issueType: "RadioIssue" },
		{ label: "RIO reboot", issueType: "RoboRioIssue" },
		{ label: "Lost comms", issueType: "RadioIssue" },
		{ label: "Lost power", issueType: "RobotPwrIssue" },
		{ label: "Driver station issues", issueType: "DSIssue" },
		{ label: "Controller issues", issueType: "DSIssue" },
		{ label: "Code issues", issueType: "RoboRioIssue" },
		{ label: "CAN issues", issueType: "RoboRioIssue" },
		{ label: "Unable to drive", issueType: "OtherRobotIssue" },
		{ label: "BYPASSED - no connection", issueType: "RadioIssue" },
		{ label: "BYPASSED - no code", issueType: "RoboRioIssue" },
		{ label: "BYPASSED - no robot", issueType: "NoRobot" },
	];

	function appendLabel(label: string, type: FTAEventNoteIssueType) {
		issueType = type;
		selectedLabel = label;
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
				issue_type: issueType ?? "Other",
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
		{#each QUICK_LABELS as { label, issueType: itemType }}
			<button
				type="button"
				class="text-xs px-2 py-1 rounded border transition-colors
				{selectedLabel === label
					? 'border-blue-500 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
					: 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-700 dark:text-gray-300'}"
				onclick={() => appendLabel(label, itemType)}
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
