<script lang="ts">
	import { Button, Indicator, Modal, Toggle } from "flowbite-svelte";
	import { onMount } from "svelte";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";
	import { trpc } from "../../main";
	import { toast } from "../../util/toast";
	import { getPlayoffViewLabel } from "../../util/playoffViewLabel";
	import { LATEST_EXTENSION_VERSION } from "../../util/updater";
	import { navigate } from "../../router";
	import QrCode from "svelte-qrcode";
	import IntegrationAutoEvents from "./integrations/IntegrationAutoEvents.svelte";
	import IntegrationFmsFtaApp from "./integrations/IntegrationFmsFtaApp.svelte";
	import IntegrationNexus from "./integrations/IntegrationNexus.svelte";
	import IntegrationSlack from "./integrations/IntegrationSlack.svelte";
	import IntegrationWpaKiosk from "./integrations/IntegrationWpaKiosk.svelte";

	let qrModalOpen = $state(false);
	let extensionDetected = $state(false);
	let extensionEnabled = $state(false);
	let extensionFieldMonitor = $state(false);
	let extensionUseSignalR = $state(true);
	let extensionFmsApiEnabled = $state(true);
	let extensionVersion = $state("");
	let extensionOutdated = $state(false);
	let extensionConfiguring = $state(false);
	let extensionConfigured = $state(false);
	let fmsExtensionConnected = $state(false);
	let extensionConfigDialogOpen = $state(false);
	let configFieldMonitor = $state(true);
	let configUseSignalR = $state(true);
	let configFmsApiEnabled = $state(true);

	window.addEventListener("message", (event) => {
		if (event.data?.type === "pong") {
			extensionDetected = true;
			extensionVersion = event.data.version ?? "";
			extensionEnabled = event.data.enabled ?? false;
			extensionFieldMonitor = event.data.fieldMonitor ?? false;
			extensionUseSignalR = event.data.useSignalR ?? true;
			extensionFmsApiEnabled = event.data.fmsApiEnabled ?? true;
			extensionOutdated = extensionVersion < LATEST_EXTENSION_VERSION;
			fmsExtensionConnected = event.data.fms ?? false;
		}
	});

	async function configureExtension(fieldMonitor: boolean, useSignalR: boolean, fmsApiEnabled: boolean) {
		extensionConfiguring = true;
		extensionConfigured = false;
		try {
			const notepadOnly = !fieldMonitor;
			await trpc.event.setNotepadOnly.mutate({ notepadOnly });
			eventStore.update((e) => ({ ...e, notepadOnly }));
			window.postMessage(
				{
					source: "page",
					type: "eventCode",
					code: $eventStore.code,
					token: $userStore.eventToken,
					fieldMonitor,
					useSignalR,
					fmsApiEnabled,
				},
				"*",
			);
			await new Promise((resolve) => setTimeout(resolve, 600));
			extensionFieldMonitor = fieldMonitor;
			extensionUseSignalR = useSignalR;
			extensionFmsApiEnabled = fmsApiEnabled;
			extensionConfigured = true;
		} finally {
			extensionConfiguring = false;
		}
	}

	function openConfigDialog() {
		configFieldMonitor = $eventStore.notepadOnly ? false : extensionDetected ? extensionFieldMonitor : true;
		configUseSignalR = extensionDetected ? extensionUseSignalR : true;
		configFmsApiEnabled = extensionDetected ? extensionFmsApiEnabled : true;
		extensionConfigDialogOpen = true;
	}

	onMount(() => {
		window.postMessage({ source: "page", type: "ping" }, "*");
	});

	let playoffModeBlocked = $state(false);
	let reimportingTeams = $state(false);

	async function reimportTeamsFromTBA() {
		reimportingTeams = true;
		try {
			const res = await trpc.event.reimportTeamsFromTBA.mutate();
			const teams = await trpc.event.getTeams.query();
			eventStore.update((e) => ({ ...e, teams: teams ?? [] }));
			toast("Teams Reimported", `${res.count} teams imported from TBA`, "green-500");
		} catch (e) {
			if (e instanceof Error) toast("Error", e.message);
		} finally {
			reimportingTeams = false;
		}
	}

	async function togglePlayoffMode() {
		playoffModeBlocked = true;
		try {
			const res = await trpc.event.setPlayoffMode.mutate({ playoffMode: !$eventStore.playoffMode });
			eventStore.update((e) => ({ ...e, playoffMode: res.playoffMode }));
			toast(
				"Inter-Divisional Playoffs",
				res.playoffMode
					? `Enabled - ${getPlayoffViewLabel($eventStore.code)} view is now active`
					: "Disabled - Combined view restored",
				res.playoffMode ? "blue-500" : "green-500",
			);
		} catch (e) {
			if (e instanceof Error) toast("Error", e.message);
		} finally {
			playoffModeBlocked = false;
		}
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
	}
</script>

<h1 class="text-2xl font-bold mb-4">Event Management</h1>

{#if $eventStore.notepadOnly}
	<div class="flex items-center gap-3 mb-4">
		<div class="inline-flex gap-2 font-bold">
			<Indicator color="yellow" class="my-auto" />
			<span class="text-yellow-300">Notepad Only Mode - live field data streaming is disabled</span>
		</div>
		<Button size="xs" color="alternative" onclick={openConfigDialog}>Configure Extension</Button>
	</div>
{:else}
	<div class="flex items-center gap-3 mb-4">
		<div class="flex flex-col gap-0.5">
			<span class="inline-flex gap-2 font-bold">
				<Indicator color={fmsExtensionConnected ? "green" : "red"} class="my-auto" />
				{#if fmsExtensionConnected}
					<span class="text-green-500">Extension Connected</span>
				{:else}
					<span class="text-red-400">No Extension Connected</span>
				{/if}
			</span>
			{#if extensionDetected}
				<span class="text-xs text-gray-500">
					{#if !extensionEnabled}
						Extension not enabled
					{:else if !extensionFieldMonitor}
						Field monitor off
					{:else if extensionUseSignalR}
						SignalR mode
					{:else}
						Scraping mode
					{/if}
				</span>
			{:else}
				<span class="text-xs text-gray-500">
					No extension detected -
					<a
						href="https://chromewebstore.google.com/detail/fta-buddy/kddnhihfpfnehnnhbkfajdldlgigohjc"
						target="_blank"
						class="text-blue-400 hover:underline">Install</a
					>
				</span>
			{/if}
		</div>
		<Button size="xs" color="alternative" onclick={openConfigDialog}>Configure Extension</Button>
	</div>
{/if}

<div class="border border-gray-200 dark:border-neutral-700 rounded-xl p-4 mb-6">
	<p class="text-sm text-gray-600 dark:text-gray-400 mb-2">Use this information to connect your app.</p>
	<div class="flex flex-col gap-1">
		<div class="flex items-center gap-2">
			<span class="text-sm text-gray-600 dark:text-gray-400 w-24">Event Code</span>
			<code class="bg-gray-100 dark:bg-neutral-800 px-2 py-0.5 rounded-lg text-sm">{$eventStore.code}</code>
			<button class="text-xs text-blue-400 hover:underline" onclick={() => copyToClipboard($eventStore.code)}
				>copy</button
			>
		</div>
		<div class="flex items-center gap-2">
			<span class="text-sm text-gray-600 dark:text-gray-400 w-24">Event Pin</span>
			<code class="bg-gray-100 dark:bg-neutral-800 px-2 py-0.5 rounded-lg text-sm">{$eventStore.pin}</code>
			<button class="text-xs text-blue-400 hover:underline" onclick={() => copyToClipboard($eventStore.pin)}
				>copy</button
			>
		</div>
		{#if $userStore.eventToken}
			<div class="flex items-center gap-2">
				<span class="text-sm text-gray-600 dark:text-gray-400 w-24">Magic Link</span>
				<code
					class="bg-gray-100 dark:bg-neutral-800 px-2 py-0.5 rounded-lg text-xs text-gray-600 dark:text-gray-400 max-w-xs truncate"
					>https://ftabuddy.com/join/{$userStore.eventToken}</code
				>
				<button
					class="text-xs text-blue-400 hover:underline"
					onclick={() => copyToClipboard(`https://ftabuddy.com/join/${$userStore.eventToken}`)}>copy</button
				>
				<button class="text-xs text-blue-400 hover:underline" onclick={() => (qrModalOpen = true)}
					>QR Code</button
				>
			</div>
		{/if}
		{#if $userStore.eventToken}
			<div class="flex items-center gap-2">
				<span class="text-sm text-gray-600 dark:text-gray-400 w-24">API Token</span>
				<code
					class="bg-gray-100 dark:bg-neutral-800 px-2 py-0.5 rounded-lg text-xs text-gray-600 dark:text-gray-400 max-w-xs truncate"
					>{$userStore.eventToken}</code
				>
				<button
					class="text-xs text-blue-400 hover:underline"
					onclick={() => copyToClipboard($userStore.eventToken ?? "")}>copy</button
				>
			</div>
		{/if}
	</div>
</div>

{#if $eventStore.subEvents?.length}
	<div class="border border-gray-200 dark:border-neutral-700 rounded-xl p-4 mb-6">
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-base font-semibold">Sub-Events</h2>
			<Button size="sm" color="alternative" onclick={() => navigate("/manage/meshed-event")}>Edit Labels</Button>
		</div>
		<div class="flex flex-wrap gap-2 mb-4">
			{#each $eventStore.subEvents ?? [] as sub}
				<span class="text-sm bg-gray-100 dark:bg-neutral-800 px-2 py-0.5 rounded-lg"
					>{sub.code} — {sub.label}</span
				>
			{/each}
		</div>
		<div class="flex items-start justify-between gap-4">
			<div>
				<h2 class="text-base font-semibold">Inter-Divisional Playoffs</h2>
				<p class="text-sm text-gray-400 mt-1">
					When enabled, the <strong
						>{getPlayoffViewLabel($eventStore.meshedEventCode ?? $eventStore.code)}</strong
					>
					view acts as a normal single-field event - field monitor, match logs, and notes are scoped to
					<code class="bg-gray-100 dark:bg-neutral-800 px-1 rounded"
						>{$eventStore.meshedEventCode ?? $eventStore.code}</code
					>
					only. Divisional sub-events remain accessible from the sidebar.
				</p>
			</div>
			<Button
				color={$eventStore.playoffMode ? "red" : "blue"}
				class="shrink-0"
				disabled={playoffModeBlocked}
				onclick={togglePlayoffMode}
			>
				{$eventStore.playoffMode ? "Disable" : "Enable"} Inter-Divisional Playoffs
			</Button>
		</div>
		{#if $eventStore.playoffMode}
			<p class="text-sm text-blue-400 mt-3">
				✓ Inter-divisional playoffs mode is active. Combined view is now <strong
					>{getPlayoffViewLabel($eventStore.meshedEventCode ?? $eventStore.code)}</strong
				>.
			</p>
		{/if}
	</div>
{/if}

<h2 class="text-lg font-bold mb-3">Teams</h2>

<div class="border border-gray-200 dark:border-neutral-700 rounded-xl p-4 mb-6 flex items-center justify-between gap-4">
	<div>
		<p class="font-semibold">Reimport Teams from TBA</p>
		<p class="text-sm text-gray-400">
			Replace the team list with the current team list from The Blue Alliance. Existing checklist data is
			preserved.
		</p>
	</div>
	<Button size="sm" color="alternative" disabled={reimportingTeams} onclick={reimportTeamsFromTBA}>
		{reimportingTeams ? "Importing…" : "Reimport Teams"}
	</Button>
</div>

<h2 class="text-lg font-bold mb-3">Integrations</h2>

<div class="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
	<IntegrationNexus />
	<IntegrationFmsFtaApp />
	<IntegrationWpaKiosk />
	<IntegrationSlack />
	<IntegrationAutoEvents />
</div>

{#if $userStore.eventToken}
	<Modal title="Configure Extension" bind:open={extensionConfigDialogOpen} outsideclose size="sm">
		<div class="flex flex-col gap-4 text-left">
			<div class="flex items-center justify-between">
				<div>
					<p class="font-semibold">Field Monitor</p>
					<p class="text-sm text-gray-400">Stream live field data to this device.</p>
				</div>
				<Toggle bind:checked={configFieldMonitor} class="ml-4 shrink-0" />
			</div>
			{#if configFieldMonitor}
				<div class="flex items-center justify-between border-t border-neutral-700 pt-3">
					<div>
						<p class="font-semibold">Use SignalR</p>
						<p class="text-sm text-gray-400">
							Connects via SignalR for live match state and cycle tracking. When off, scrapes the FMS
							FieldMonitor page instead.
						</p>
					</div>
					<Toggle bind:checked={configUseSignalR} class="ml-4 shrink-0" />
				</div>
			{/if}
			<div class="flex items-center justify-between border-t border-neutral-700 pt-3">
				<div>
					<p class="font-semibold">FMS API</p>
					<p class="text-sm text-gray-400">Poll FMS for team lists and match data.</p>
				</div>
				<Toggle bind:checked={configFmsApiEnabled} class="ml-4 shrink-0" />
			</div>
		</div>
		{#snippet footer()}
			<div class="flex gap-2 justify-end">
				<Button color="alternative" onclick={() => (extensionConfigDialogOpen = false)}>Cancel</Button>
				<Button
					disabled={extensionConfiguring}
					onclick={async () => {
						await configureExtension(configFieldMonitor, configUseSignalR, configFmsApiEnabled);
						extensionConfigDialogOpen = false;
					}}
				>
					{extensionConfiguring ? "Applying…" : "Apply"}
				</Button>
			</div>
		{/snippet}
	</Modal>
{/if}

{#if $userStore.eventToken}
	<Modal title="Join Event QR Code" bind:open={qrModalOpen} outsideclose size="xs">
		<div class="flex flex-col items-center gap-3">
			<p class="text-sm text-gray-400 text-center">Scan to join the event on FTA Buddy</p>
			<div class="max-w-64 w-full mx-auto">
				<QrCode value={`https://ftabuddy.com/join/${$userStore.eventToken}`} padding={12} />
			</div>
			<Button onclick={() => (qrModalOpen = false)} class="w-full">Close</Button>
		</div>
	</Modal>
{/if}
