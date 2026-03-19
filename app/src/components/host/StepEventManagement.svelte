<script lang="ts">
	import { Button, Indicator } from "flowbite-svelte";
	import { onMount } from "svelte";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";
	import { LATEST_EXTENSION_VERSION } from "../../util/updater";
	import IntegrationAutoEvents from "./integrations/IntegrationAutoEvents.svelte";
	import IntegrationFmsFtaApp from "./integrations/IntegrationFmsFtaApp.svelte";
	import IntegrationNexus from "./integrations/IntegrationNexus.svelte";
	import IntegrationSlack from "./integrations/IntegrationSlack.svelte";
	import IntegrationWpaKiosk from "./integrations/IntegrationWpaKiosk.svelte";

	let extensionDetected = $state(false);
	let extensionEnabled = $state(false);
	let extensionFieldMonitor = $state(false);
	let extensionVersion = $state("");
	let extensionOutdated = $state(false);
	let extensionConfiguring = $state(false);
	let extensionConfigured = $state(false);
	let fmsExtensionConnected = $state(false);

	window.addEventListener("message", (event) => {
		if (event.data?.type === "pong") {
			extensionDetected = true;
			extensionVersion = event.data.version ?? "";
			extensionEnabled = event.data.enabled ?? false;
			extensionFieldMonitor = event.data.fieldMonitor ?? false;
			extensionOutdated = extensionVersion < LATEST_EXTENSION_VERSION;
			fmsExtensionConnected = event.data.fms ?? false;
		}
	});

	async function configureExtension() {
		extensionConfiguring = true;
		extensionConfigured = false;
		try {
			window.postMessage(
				{
					source: "page",
					type: "eventCode",
					code: $eventStore.code,
					token: $userStore.eventToken,
					fieldMonitor: true,
				},
				"*",
			);
			await new Promise((resolve) => setTimeout(resolve, 600));
			extensionConfigured = true;
		} finally {
			extensionConfiguring = false;
		}
	}

	onMount(() => {
		window.postMessage({ source: "page", type: "ping" }, "*");
	});

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
	}
</script>

<h1 class="text-2xl font-bold mb-4">Event Management</h1>

{#if $eventStore.notepadOnly}
	<div class="inline-flex gap-2 font-bold mb-4">
		<Indicator color="yellow" class="my-auto" />
		<span class="text-yellow-300">Notepad Only Mode - live field data streaming is disabled</span>
	</div>
{:else}
	<div class="flex flex-col items-start gap-1 mb-4">
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
					Extension not enabled -
				{:else if !extensionFieldMonitor}
					Field monitor off -
				{:else}
					Field monitor on ·
				{/if}
				<button
					class="text-blue-400 hover:underline disabled:opacity-50"
					disabled={extensionConfiguring}
					onclick={configureExtension}
				>
					{extensionConfiguring
						? "Configuring…"
						: extensionConfigured
							? "Reconfigure extension"
							: "Configure extension"}
				</button>
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
{/if}

<div class="border border-neutral-700 rounded-xl p-4 mb-6">
	<p class="text-sm text-gray-400 mb-2">Use this information to connect your app.</p>
	<div class="flex flex-col gap-1">
		<div class="flex items-center gap-2">
			<span class="text-sm text-gray-400 w-24">Event Code</span>
			<code class="bg-neutral-800 px-2 py-0.5 rounded-lg text-sm">{$eventStore.code}</code>
			<button class="text-xs text-blue-400 hover:underline" onclick={() => copyToClipboard($eventStore.code)}
				>copy</button
			>
		</div>
		<div class="flex items-center gap-2">
			<span class="text-sm text-gray-400 w-24">Event Pin</span>
			<code class="bg-neutral-800 px-2 py-0.5 rounded-lg text-sm">{$eventStore.pin}</code>
			<button class="text-xs text-blue-400 hover:underline" onclick={() => copyToClipboard($eventStore.pin)}
				>copy</button
			>
		</div>
		{#if $userStore.eventToken}
			<div class="flex items-center gap-2">
				<span class="text-sm text-gray-400 w-24">API Token</span>
				<code class="bg-neutral-800 px-2 py-0.5 rounded-lg text-xs text-gray-400 max-w-xs truncate"
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

<h2 class="text-lg font-bold mb-3">Integrations</h2>

<div class="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
	<IntegrationNexus />
	<IntegrationFmsFtaApp />
	<IntegrationWpaKiosk />
	<IntegrationSlack />
	<IntegrationAutoEvents />
</div>
