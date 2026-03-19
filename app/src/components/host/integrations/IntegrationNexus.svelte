<script lang="ts">
	import { Button, Helper, Indicator, Input, Label } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import type { NexusStatus } from "../../../../../shared/types";
	import { trpc } from "../../../main";

	let expanded = $state(false);
	let nexusApiKey = $state("");
	let nexusSaving = $state(false);
	let nexusSaveError = $state("");
	let nexusStatus: (NexusStatus & { nexusApiKeyIsSet: boolean }) | null = $state(null);
	let statusInterval: ReturnType<typeof setInterval> | null = null;

	async function saveApiKey() {
		nexusSaving = true;
		nexusSaveError = "";
		try {
			await trpc.event.setNexusApiKey.mutate({ nexusApiKey });
			await refreshStatus();
			nexusApiKey = "";
		} catch (e: any) {
			nexusSaveError = e?.message ?? "Failed to save";
		} finally {
			nexusSaving = false;
		}
	}

	async function refreshStatus() {
		try {
			nexusStatus = await trpc.event.getNexusStatus.query();
		} catch {}
	}

	function stateColor(state: NexusStatus["state"] | undefined): "green" | "yellow" | "red" | "gray" | "blue" {
		switch (state) {
			case "polling":
				return "blue";
			case "polling_slow":
				return "green";
			case "complete":
				return "green";
			case "unauthorized":
				return "red";
			case "error":
				return "yellow";
			case "event_over":
				return "gray";
			default:
				return "gray";
		}
	}

	function stateLabel(status: (NexusStatus & { nexusApiKeyIsSet?: boolean }) | null): string {
		if (!status) return "Loading...";
		switch (status.state) {
			case "not_configured":
				return status.nexusApiKeyIsSet ? "API key set - event has no end date" : "Not configured";
			case "polling":
				return "Polling every 2 min";
			case "polling_slow":
				return "Polling every 30 min (all inspected)";
			case "complete":
				return "All teams inspected ✓";
			case "unauthorized":
				return "Unauthorized - check API key";
			case "error":
				return `Error${status.lastErrorMessage ? ": " + status.lastErrorMessage : ""}`;
			case "event_over":
				return "Event ended - polling stopped";
			default:
				return status.state;
		}
	}

	onMount(() => {
		refreshStatus();
		statusInterval = setInterval(refreshStatus, 30_000);
	});

	onDestroy(() => {
		if (statusInterval) clearInterval(statusInterval);
	});
</script>

<div class="rounded-xl border border-neutral-700 bg-neutral-900 overflow-hidden">
	<button
		class="flex w-full items-center justify-between gap-3 p-4 text-left h-20"
		onclick={() => (expanded = !expanded)}
	>
		<div class="flex items-center gap-3">
			<span class="text-2xl">🔍</span>
			<div>
				<p class="font-semibold">Nexus Inspection API</p>
				<p class="text-sm text-gray-400">Pull inspection status into the checklist.</p>
			</div>
		</div>
		<div class="flex items-center gap-2 shrink-0">
			{#if nexusStatus}
				<Indicator color={stateColor(nexusStatus.state)} />
			{/if}
			<svg
				class="size-5 text-neutral-400 transition-transform {expanded ? 'rotate-180' : ''}"
				viewBox="0 0 20 20"
				fill="currentColor"
			>
				<path
					fill-rule="evenodd"
					d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
					clip-rule="evenodd"
				/>
			</svg>
		</div>
	</button>

	{#if expanded}
		<div class="flex flex-col gap-3 px-4 pb-4 border-t border-neutral-700 pt-4">
			<p class="text-sm text-gray-400">
				FTA Buddy polls every 2 minutes. Find your API key
				<a href="https://frc.nexus/en/api" target="_blank" class="text-blue-400 hover:underline">here</a>.
			</p>
			<div class="flex flex-row gap-2 items-end">
				<div class="flex-1">
					<Label for="nexus-key" class="mb-1 block text-sm">Nexus API Key</Label>
					<Input
						id="nexus-key"
						type="password"
						placeholder={nexusStatus?.nexusApiKeyIsSet ? "••••••••" : "Paste your Nexus API key here"}
						bind:value={nexusApiKey}
						autocomplete="off"
						onkeydown={(e) => {
							if (e.key === "Enter" && nexusApiKey) saveApiKey();
						}}
					/>
				</div>
				<Button onclick={saveApiKey} disabled={nexusSaving || !nexusApiKey}>
					{nexusSaving ? "Saving…" : "Save"}
				</Button>
			</div>
			{#if nexusSaveError}
				<Helper color="red">{nexusSaveError}</Helper>
			{/if}
			{#if nexusStatus}
				<div class="flex flex-col gap-1 pt-3 border-t border-neutral-700">
					<span class="inline-flex items-center gap-2 text-sm">
						<Indicator color={stateColor(nexusStatus.state)} class="shrink-0" />
						<span class="font-medium">{stateLabel(nexusStatus)}</span>
					</span>
					{#if nexusStatus.lastSuccessAt}
						<p class="text-xs text-gray-500">
							Last synced: {new Date(nexusStatus.lastSuccessAt).toLocaleTimeString()}
						</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
