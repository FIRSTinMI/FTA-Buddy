<script lang="ts">
	import { Toggle } from "flowbite-svelte";
	import { onMount } from "svelte";
	import {
		AUTO_EVENT_ISSUE_TYPES,
		type AutoEventIssueType,
		type EventAutoEventSettings,
	} from "../../../../../shared/types";
	import { trpc } from "../../../main";

	let expanded = $state(false);
	let autoEventSettings: EventAutoEventSettings = $state({});
	let autoEventSaving = $state(false);

	const ISSUE_LABELS: Record<AutoEventIssueType, string> = {
		Bypassed: "Bypassed",
		"Code disconnect": "Code Disconnect",
		"RIO disconnect": "RIO Disconnect",
		"Radio disconnect": "Radio Disconnect",
		"DS disconnect": "DS Disconnect",
		Brownout: "Brownout",
		"Large spike in ping": "Large Spike in Ping",
		"Sustained high ping": "Sustained High Ping",
		"Low signal": "Low Signal",
		"High BWU": "High BWU",
	};

	async function loadSettings() {
		try {
			autoEventSettings = await trpc.event.getAutoEventSettings.query();
		} catch {}
	}

	async function saveSettings() {
		autoEventSaving = true;
		try {
			await trpc.event.setAutoEventSettings.mutate({ settings: autoEventSettings });
		} catch (e: any) {
			console.error("Failed to save auto-event settings", e);
		} finally {
			autoEventSaving = false;
		}
	}

	function toggleIssue(issue: AutoEventIssueType) {
		const current = autoEventSettings[issue] !== false;
		autoEventSettings = { ...autoEventSettings, [issue]: !current };
		saveSettings();
	}

	onMount(() => {
		loadSettings();
	});
</script>

<div class="rounded-xl border border-neutral-700 bg-neutral-900 overflow-hidden">
	<button
		class="flex w-full items-center justify-between gap-3 p-4 text-left h-20"
		onclick={() => (expanded = !expanded)}
	>
		<div class="flex items-center gap-3">
			<span class="text-2xl">⚡</span>
			<div>
				<p class="font-semibold">Auto Match Events</p>
				<p class="text-sm text-gray-400">Auto-create notes when log analysis detects issues.</p>
			</div>
		</div>
		<svg
			class="size-5 text-neutral-400 shrink-0 transition-transform {expanded ? 'rotate-180' : ''}"
			viewBox="0 0 20 20"
			fill="currentColor"
		>
			<path
				fill-rule="evenodd"
				d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
				clip-rule="evenodd"
			/>
		</svg>
	</button>

	{#if expanded}
		<div class="flex flex-col gap-3 px-4 pb-4 border-t border-neutral-700 pt-4">
			<p class="text-sm text-gray-400">Toggle which issue types automatically generate Notepad entries.</p>
			<div class="flex flex-col gap-2">
				{#each AUTO_EVENT_ISSUE_TYPES as issue}
					<div class="flex items-center justify-between gap-2">
						<span class="text-sm">{ISSUE_LABELS[issue]}</span>
						<Toggle
							size="small"
							checked={autoEventSettings[issue] !== false}
							onchange={() => toggleIssue(issue)}
						/>
					</div>
				{/each}
			</div>
			{#if autoEventSaving}
				<p class="text-xs text-gray-500">Saving...</p>
			{/if}
		</div>
	{/if}
</div>
