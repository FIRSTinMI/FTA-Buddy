<script lang="ts">
	import { Button, Helper, Indicator, Input, Label, Toggle } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import type { NexusStatus } from "../../../../shared/types";
	import { AUTO_EVENT_ISSUE_TYPES, type AutoEventIssueType, type EventAutoEventSettings } from "../../../../shared/types";
	import { trpc } from "../../main";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";
	import { LATEST_EXTENSION_VERSION } from "../../util/updater";

	// Nexus state
	let nexusApiKey = $state("");
	let nexusSaving = $state(false);
	let nexusSaveError = $state("");
	let nexusStatus: (NexusStatus & { nexusApiKeyIsSet: boolean }) | null = $state(null);
	let nexusStatusInterval: ReturnType<typeof setInterval> | null = $state(null);

	// FMS Event Password state
	let fmsEventPassword = $state("");
	let fmsPasswordSaving = $state(false);
	let fmsPasswordSaveError = $state("");
	let fmsPasswordIsSet = $state(false);
	let fmsExtensionConnected = $state(false);
	let fmsLastSeenAt: Date | null = $state(null);
	let fmsStatusInterval: ReturnType<typeof setInterval> | null = $state(null);

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
		} catch {
			/* ignore */
		}
	}

	async function saveFmsEventPassword() {
		fmsPasswordSaving = true;
		fmsPasswordSaveError = "";
		try {
			await trpc.event.setFmsEventPassword.mutate({ fmsEventPassword });
			await refreshFmsStatus();
			fmsEventPassword = "";
		} catch (e: any) {
			fmsPasswordSaveError = e?.message ?? "Failed to save";
		} finally {
			fmsPasswordSaving = false;
		}
	}

	async function refreshFmsStatus() {
		try {
			const status = await trpc.event.getFmsIntegrationStatus.query();
			fmsPasswordIsSet = status.passwordConfigured;
			fmsExtensionConnected = status.extensionConnected;
			fmsLastSeenAt = status.lastSeenAt ? new Date(status.lastSeenAt) : null;
		} catch {
			/* ignore */
		}
	}

	// Auto-Event Settings state
	let autoEventSettings: EventAutoEventSettings = $state({});
	let autoEventSaving = $state(false);

	const ISSUE_LABELS: Record<AutoEventIssueType, string> = {
		"Bypassed": "Bypassed",
		"Code disconnect": "Code Disconnect",
		"RIO disconnect": "RIO Disconnect",
		"Radio disconnect": "Radio Disconnect",
		"DS disconnect": "DS Disconnect",
		"Brownout": "Brownout",
		"Large spike in ping": "Large Spike in Ping",
		"Sustained high ping": "Sustained High Ping",
		"Low signal": "Low Signal",
		"High BWU": "High BWU",
	};

	async function loadAutoEventSettings() {
		try {
			autoEventSettings = await trpc.event.getAutoEventSettings.query();
		} catch { /* ignore */ }
	}

	async function saveAutoEventSettings() {
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
		const current = autoEventSettings[issue] !== false; // default enabled
		autoEventSettings = { ...autoEventSettings, [issue]: !current };
		saveAutoEventSettings();
	}

	// Extension state
	let extensionDetected = $state(false);
	let extensionEnabled = $state(false);
	let extensionFieldMonitor = $state(false);
	let extensionVersion = $state("");
	let extensionOutdated = $state(false);
	let extensionConfiguring = $state(false);
	let extensionConfigured = $state(false);

	window.addEventListener("message", (event) => {
		if (event.data?.type === "pong") {
			extensionDetected = true;
			extensionVersion = event.data.version ?? "";
			extensionEnabled = event.data.enabled ?? false;
			extensionFieldMonitor = event.data.fieldMonitor ?? false;
			extensionOutdated = extensionVersion < LATEST_EXTENSION_VERSION;
		}
	});

	async function configureExtension() {
		extensionConfiguring = true;
		extensionConfigured = false;
		try {
			window.postMessage(
				{ source: "page", type: "eventCode", code: $eventStore.code, token: $userStore.eventToken, fieldMonitor: true },
				"*"
			);
			await new Promise((resolve) => setTimeout(resolve, 600));
			extensionConfigured = true;
		} finally {
			extensionConfiguring = false;
		}
	}

	onMount(() => {
		window.postMessage({ source: "page", type: "ping" }, "*");
		refreshNexusStatus();
		nexusStatusInterval = setInterval(refreshNexusStatus, 30_000);
		refreshFmsStatus();
		fmsStatusInterval = setInterval(refreshFmsStatus, 15_000);
		loadAutoEventSettings();
	});

	onDestroy(() => {
		if (nexusStatusInterval) clearInterval(nexusStatusInterval);
		if (fmsStatusInterval) clearInterval(fmsStatusInterval);
	});

	function nexusStateColor(state: NexusStatus["state"] | undefined): "green" | "yellow" | "red" | "gray" | "blue" {
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

	function nexusStateLabel(status: (NexusStatus & { nexusApiKeyIsSet?: boolean }) | null): string {
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

	type FmsIntegrationState = "not_configured" | "no_extension" | "ready";

	function fmsIntegrationState(): FmsIntegrationState {
		if (!fmsPasswordIsSet) return "not_configured";
		if (!fmsExtensionConnected) return "no_extension";
		return "ready";
	}

	function fmsIntegrationColor(): "green" | "yellow" | "gray" {
		switch (fmsIntegrationState()) {
			case "ready":
				return "green";
			case "no_extension":
				return "yellow";
			case "not_configured":
				return "gray";
		}
	}

	function fmsIntegrationLabel(): string {
		switch (fmsIntegrationState()) {
			case "ready":
				return "FTA App Sync Enabled";
			case "no_extension": {
				const ago = fmsLastSeenAt ? ` (last seen ${fmsLastSeenAt.toLocaleTimeString()})` : " - never seen";
				return `FTA App Sync Offline${ago}`;
			}
			case "not_configured":
				return "Not configured";
		}
	}
</script>

<div class="container mx-auto md:max-w-5xl flex flex-col p-4 py-8 space-y-3  h-full pb-12 overflow-y-auto">
	<h1 class="text-2xl font-bold">Event Management</h1>
	<span class="inline-flex gap-2 font-bold mx-auto">
		<Indicator color={fmsExtensionConnected ? "green" : "red"} class="my-auto" />
		{#if fmsExtensionConnected}
			<span class="text-green-500">Extension Connected</span>
			{#if fmsLastSeenAt}
				<span class="text-yellow-500 text-xs font-normal my-auto">(last seen {fmsLastSeenAt.toLocaleTimeString()})</span>
			{/if}
		{:else}
			<span class="text-red-400">No Extension Connected</span>
		{/if}
	</span>
	<div class="flex flex-col border-t border-neutral-500 pt-5 gap-6">
		<div class="border-b border-neutral-500 pb-5">
			<div>
				<p>Use this information to connect your app.</p>
				<h2 class="text-lg">
					Event Code: <code class="bg-neutral-900 px-2 py-.75 rounded-xl">{$eventStore.code}</code>
				</h2>
				<h2 class="text-lg">
					Event Pin: <code class="bg-neutral-900 px-2 py-.75 rounded-xl">{$eventStore.pin}</code>
				</h2>
				<p class="text-sm text-gray-600">
					Event Token (for API use): <code class="bg-neutral-900 px-2 py-.75 rounded-lg"
						>{$userStore.eventToken}</code
					>
				</p>
			</div>
		</div>

        <h1 class="text-lg font-bold">Integrations</h1>
        
		<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
			<!-- Browser Extension -->
			<div class="flex flex-col gap-3 rounded-xl border border-neutral-700 bg-neutral-900 p-5">
				<h2 class="text-xl font-bold">Browser Extension</h2>
				<p class="text-sm text-gray-400">
					Configure the FTA Buddy extension on this computer to send field monitor data for this event.
				</p>
				{#if !extensionDetected}
					<span class="inline-flex items-center gap-2 text-sm">
						<Indicator color="red" class="shrink-0" />
						<span>Extension not detected</span>
						<a
							href="https://chromewebstore.google.com/detail/fta-buddy/kddnhihfpfnehnnhbkfajdldlgigohjc"
							target="_blank"
							class="text-blue-400 hover:underline">Install</a
						>
					</span>
				{:else}
					<div class="flex flex-col gap-1 py-2 border-t border-neutral-700 mt-1">
						<span class="inline-flex items-center gap-2 text-sm">
							<Indicator color={extensionEnabled ? (extensionFieldMonitor ? "green" : "yellow") : "red"} class="shrink-0" />
							{#if !extensionEnabled}
								<span>Extension not enabled</span>
							{:else if !extensionFieldMonitor}
								<span>Enabled — field monitor off</span>
							{:else}
								<span class="text-green-400">Enabled + field monitor on</span>
							{/if}
							{#if extensionOutdated}
								<span class="text-yellow-400 text-xs">(update available: {LATEST_EXTENSION_VERSION})</span>
							{:else if extensionVersion}
								<span class="text-gray-500 text-xs">v{extensionVersion}</span>
							{/if}
						</span>
					</div>
				{/if}
				<Button
					onclick={configureExtension}
					disabled={!extensionDetected || extensionConfiguring}
				>
					{#if extensionConfiguring}
						Configuring…
					{:else if extensionConfigured}
						Reconfigure Extension
					{:else}
						Configure Extension
					{/if}
				</Button>
				{#if extensionConfigured}
					<Helper color="green">Extension configured with field monitor enabled.</Helper>
				{/if}
			</div>

			<div class="flex flex-col gap-3 rounded-xl border border-neutral-700 bg-neutral-900 p-5">
				<h2 class="text-xl font-bold">Nexus Inspection API</h2>
				<p class="text-sm text-gray-400">
					Pull inspection status from Nexus directly into the checklist. FTA Buddy polls every 2 minutes. Find
					your API key <a
						href="https://frc.nexus/en/api"
						target="_blank"
						class="text-blue-400 hover:underline">here</a
					>.
				</p>
				<div class="flex flex-row gap-2 items-end mt-1">
					<div class="flex-1">
						<Label for="nexus-key" class="mb-1 block text-sm">Nexus API Key</Label>
						<Input
							id="nexus-key"
							type="password"
							placeholder={nexusStatus?.nexusApiKeyIsSet ? "••••••••" : "Paste your Nexus API key here"}
							bind:value={nexusApiKey}
							autocomplete="off"
							onkeydown={(e) => {
								if (e.key === "Enter" && nexusApiKey) {
									saveNexusApiKey();
								}
							}}
						/>
					</div>
					<Button onclick={saveNexusApiKey} disabled={nexusSaving || !nexusApiKey}>
						{nexusSaving ? "Saving…" : "Save"}
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
							<p class="text-xs text-gray-500">
								Last synced: {new Date(nexusStatus.lastSuccessAt).toLocaleTimeString()}
							</p>
						{/if}
					</div>
				{/if}
			</div>

			<!-- FMS FTA App Integration -->
			<div class="flex flex-col gap-3 rounded-xl border border-neutral-700 bg-neutral-900 p-5">
				<h2 class="text-xl font-bold">FMS FTA App Integration</h2>
				<p class="text-sm text-gray-400">
					Allow FTA Buddy to read and write notes to FMS via the FTA App API. Enter the event password
					configured in FMS.
				</p>
				<div class="flex flex-row gap-2 items-end mt-1">
					<div class="flex-1">
						<Label for="fms-password" class="mb-1 block text-sm">FMS Event Password</Label>
						<Input
							id="fms-password"
							type="password"
							placeholder={fmsPasswordIsSet ? "••••••••" : "Enter FMS event password"}
							bind:value={fmsEventPassword}
							autocomplete="off"
							onkeydown={(e) => {
								if (e.key === "Enter" && fmsEventPassword) {
									saveFmsEventPassword();
								}
							}}
						/>
					</div>
					<Button onclick={saveFmsEventPassword} disabled={fmsPasswordSaving || !fmsEventPassword}>
						{fmsPasswordSaving ? "Saving…" : "Save"}
					</Button>
				</div>
				{#if fmsPasswordSaveError}
					<Helper color="red">{fmsPasswordSaveError}</Helper>
				{/if}
				<div class="flex flex-col gap-1 py-3 border-t border-neutral-700 mt-2">
					<span class="inline-flex items-center gap-2 text-sm">
						<Indicator color={fmsIntegrationColor()} class="shrink-0" />
						<span class="font-medium">{fmsIntegrationLabel()}</span>
					</span>
				</div>
			</div>

			<!-- WPA Kiosk Tool -->
			<div class="flex flex-col gap-3 rounded-xl border border-neutral-700 bg-neutral-900 p-5">
				<h2 class="text-xl font-bold">WPA Kiosk Tool</h2>
				<p class="text-sm text-gray-400">
					Connect your WPA Kiosk to WiFi and visit <code class="bg-neutral-800 px-2 py-0.5 rounded-lg"
						>ftabuddy.com/kiosk</code
					> to set up the extension. Radio programming status will be updated on the checklist automatically.
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
					<code class="bg-neutral-800 px-2 py-1 rounded-lg text-sm"
						>/ftabuddy {$eventStore.code} {$eventStore.pin}</code
					>
				</div>
			</div>

			<!-- Auto Match Events -->
			<div class="flex flex-col gap-3 rounded-xl border border-neutral-700 bg-neutral-900 p-5">
				<h2 class="text-xl font-bold">Auto Match Events</h2>
				<p class="text-sm text-gray-400">
					Automatically generate events in the Notepad feed when log analysis detects issues. Toggle which issue types create events.
				</p>
				<div class="flex flex-col gap-2 mt-1">
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
		</div>
	</div>
</div>
