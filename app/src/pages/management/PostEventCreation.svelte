<script lang="ts">
	import { Button, Helper, Indicator, Input, Label } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import { navigate } from "svelte-routing";
	import type { NexusStatus } from "../../../../shared/types";
	import { trpc } from "../../main";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";

	let extensionDetected = false;
	let extensionEnabled = false;
	let signalREnabled = false;
	let extensionEventCode = "";
	let extensionVersion = "unknown version";
	let fmsDetected = false;

	// Nexus state
	let nexusApiKey = "";
	let nexusSaving = false;
	let nexusSaveError = "";
	let nexusStatus: NexusStatus | null = null;
	let nexusStatusInterval: ReturnType<typeof setInterval> | null = null;

	async function saveNexusApiKey() {
		nexusSaving = true;
		nexusSaveError = "";
		try {
			await trpc.event.setNexusApiKey.mutate({ nexusApiKey });
			await refreshNexusStatus();
		} catch (e: any) {
			nexusSaveError = e?.message ?? "Failed to save";
		} finally {
			nexusSaving = false;
		}
	}

	async function refreshNexusStatus() {
		try {
			nexusStatus = await trpc.event.getNexusStatus.query();
		} catch { /* ignore */ }
	}

	window.addEventListener("message", (event) => {
		if (event.data.type === "pong") {
			extensionDetected = true;
			extensionVersion = "v" + event.data.version;
			extensionEnabled = event.data.enabled;
			extensionEventCode = event.data.eventCode;
			signalREnabled = event.data.signalR;
			fmsDetected = event.data.fms;
		}
	});

	async function checkConnection() {
		window.postMessage({ source: "page", type: "ping" }, "*");
		await new Promise((resolve) => setTimeout(resolve, 3000));
		if (!extensionDetected || !extensionEnabled || !signalREnabled || !fmsDetected) {
			checkConnection();
		} else {
			// If everything is connected and good, still check every 10 seconds
			setTimeout(checkConnection, 10000);
		}
	}

	onMount(() => {
		setTimeout(checkConnection, 200);
		refreshNexusStatus();
		nexusStatusInterval = setInterval(refreshNexusStatus, 30_000);
	});

	onDestroy(() => {
		if (nexusStatusInterval) clearInterval(nexusStatusInterval);
	});

	function nexusStateColor(state: NexusStatus['state'] | undefined): 'green' | 'yellow' | 'red' | 'gray' | 'blue' {
		switch (state) {
			case 'polling': return 'blue';
			case 'polling_slow': return 'green';
			case 'complete': return 'green';
			case 'unauthorized': return 'red';
			case 'error': return 'yellow';
			case 'event_over': return 'gray';
			default: return 'gray';
		}
	}

	function nexusStateLabel(status: NexusStatus | null): string {
		if (!status) return 'Loading...';
		switch (status.state) {
			case 'not_configured': return 'Not configured';
			case 'polling': return 'Polling every 2 min';
			case 'polling_slow': return 'Polling every 30 min (all inspected)';
			case 'complete': return 'All teams inspected ✓';
			case 'unauthorized': return 'Unauthorized - check API key';
			case 'error': return `Error${status.lastErrorMessage ? ': ' + status.lastErrorMessage : ''}`;
			case 'event_over': return 'Event ended - polling stopped';
			default: return status.state;
		}
	}
</script>

<div class="container mx-auto md:max-w-5xl flex flex-col p-4 py-8 space-y-4">
	<h1 class="text-3xl font-bold">Host a FTA Buddy Instance</h1>
	<span class="inline-flex gap-2 font-bold mx-auto">
		{#if extensionDetected}
			{#if extensionEnabled}
				{#if signalREnabled}
					<Indicator color="green" class="my-auto" />
					<span class="text-green text-green-500">Extension Enabled ({extensionVersion})</span>
                    <button
                        class="text-gray-500 hover:text-gray-300 text-xs font-normal ml-1"
                        onclick={() => window.postMessage({ source: "page", type: "eventCode", code: $eventStore.code, token: $userStore.eventToken }, "*")}
                    >Reconfigure</button>
				{:else}
					<Indicator color="red" class="my-auto" />
					<span class="text-red-500">SignalR Not Enabled</span>
					<button class="text-blue-400 hover:underline" onclick={() => window.postMessage({ source: "page", type: "enable" }, "*")}
						>Enable</button
					>
				{/if}
			{:else}
				<Indicator color="yellow" class="my-auto" />
				<span class="text-yellow-300">Extension Not Enabled</span>
				<button
					class="text-blue-400 hover:underline"
					onclick={() => {

						window.postMessage({ source: "page", type: "enable" }, "*");
					}}>Enable</button
				>
			{/if}
		{:else}
			<Indicator color="red" class="my-auto" />
			<span class="text-red-500">Extension Not Detected</span>
			<a href="https://chromewebstore.google.com/detail/fta-buddy/kddnhihfpfnehnnhbkfajdldlgigohjc" class="text-blue-400 hover:underline" target="_blank"
				>Install</a
			>
		{/if}
	</span>
	<span class="inline-flex gap-2 font-bold mx-auto">
		<Indicator color={fmsDetected ? "green" : "red"} class="my-auto" />
		{#if fmsDetected}
			<span class="text-green-500">FMS Detected</span>
		{:else}
			<span class="text-red-500">FMS Not Detected</span>
		{/if}
	</span>
	<p class="text-lg">
		FTA Buddy needs a host to send data to it from FMS. The extension must be installed and be able to communicate with FMS at
		<code class="bg-neutral-900 px-2 py-.75 rounded-xl">10.0.100.5</code>
	</p>
		<Button onclick={() => navigate("/")}>Go to FTA Buddy</Button>
	<div class="flex flex-col border-t border-neutral-500 pt-5 gap-6">
		<div class="border-b border-neutral-500 pb-5">
			<div>
				<p>Use this information to connect your app.</p>
				<h2 class="text-lg">Event Code: <code class="bg-neutral-900 px-2 py-.75 rounded-xl">{$eventStore.code}</code></h2>
				<h2 class="text-lg">Event Pin: <code class="bg-neutral-900 px-2 py-.75 rounded-xl">{$eventStore.pin}</code></h2>
				<p class="text-sm text-gray-600">
					Event Token (for API use): <code class="bg-neutral-900 px-2 py-.75 rounded-lg">{$userStore.eventToken}</code>
				</p>
			</div>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
			<div class="flex flex-col gap-3 rounded-xl border border-neutral-700 bg-neutral-900 p-5">
				<h2 class="text-xl font-bold">Nexus Inspection API</h2>
				<p class="text-sm text-gray-400">
					Pull inspection status from Nexus directly into the checklist. FTA Buddy polls every 2 minutes. Find your API key <a href="https://frc.nexus/en/api" target="_blank" class="text-blue-400 hover:underline">here</a>.
				</p>
				<div class="flex flex-row gap-2 items-end mt-1">
					<div class="flex-1">
						<Label for="nexus-key" class="mb-1 block text-sm">Nexus API Key</Label>
						<Input
							id="nexus-key"
							type="password"
							placeholder="Paste your Nexus API key here"
							bind:value={nexusApiKey}
							autocomplete="off"
						/>
					</div>
					<Button onclick={saveNexusApiKey} disabled={nexusSaving || !nexusApiKey}>
						{nexusSaving ? 'Saving…' : 'Save'}
					</Button>
				</div>
				{#if nexusSaveError}
					<Helper color="red">{nexusSaveError}</Helper>
				{/if}
				{#if nexusStatus}
					<div class="flex flex-col gap-1 py-3 border-t border-neutral-700 mt-2">
						<span class="inline-flex items-center gap-2 text-sm">
							<Indicator color={nexusStateColor(nexusStatus.state)} class="shrink-0" />
							<span class="font-medium">{nexusStateLabel(nexusStatus)}</span>
						</span>
						{#if nexusStatus.lastSuccessAt}
							<p class="text-xs text-gray-500">Last synced: {new Date(nexusStatus.lastSuccessAt).toLocaleTimeString()}</p>
						{/if}
					</div>
				{/if}
			</div>

			<!-- WPA Kiosk Tool -->
			<div class="flex flex-col gap-3 rounded-xl border border-neutral-700 bg-neutral-900 p-5">
				<h2 class="text-xl font-bold">WPA Kiosk Tool</h2>
				<p class="text-sm text-gray-400">
					Connect your WPA Kiosk to WiFi and visit <code class="bg-neutral-800 px-2 py-0.5 rounded-lg">ftabuddy.com/kiosk</code> to set up the extension. Radio programming status will be updated on the checklist automatically.
				</p>
			</div>

			<!-- Slack Bot -->
			<div class="flex flex-col gap-3 rounded-xl border border-neutral-700 bg-neutral-900 p-5">
				<h2 class="text-xl font-bold">Slack Bot</h2>
				<p class="text-sm text-gray-400">
					Sync tickets with your CSA Slack channel. Run these commands in the channel:
				</p>
				<div class="flex flex-col gap-1">
					<code class="bg-neutral-800 px-2 py-1 rounded-lg text-sm">/invite @FTA Buddy</code>
					<code class="bg-neutral-800 px-2 py-1 rounded-lg text-sm">/ftabuddy {$eventStore.code} {$eventStore.pin}</code>
				</div>
			</div>

		</div>
	</div>
</div>
