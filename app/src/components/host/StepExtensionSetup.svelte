<script lang="ts">
	import { Button, Indicator, Toggle } from "flowbite-svelte";
	import { onMount } from "svelte";
	import { navigate } from "../../router";
	import { hostWizardStore } from "../../stores/hostWizard";
	import { LATEST_EXTENSION_VERSION } from "../../util/updater";

	let extensionDetected = $state(false);
	let extensionEnabled = $state(false);
	let extensionUpdate = $state(false);
	let fmsDetected = $state(false);
	let extensionVersion = $state("unknown version");
	let teams: number[] = [];
	let waitingForFirstConnectionTest = $state(true);
	let notepadOnly = $state($hostWizardStore.notepadOnly);

	$effect(() => {
		window.postMessage({ source: "page", type: "enable", fieldMonitor: !notepadOnly }, "*");
	});

	let canAdvance = $derived(extensionDetected && extensionEnabled && fmsDetected);

	window.addEventListener("message", (event) => {
		if (event.data.type === "pong") {
			waitingForFirstConnectionTest = false;
			extensionDetected = true;
			extensionVersion = "v" + event.data.version;
			extensionUpdate = event.data.version < LATEST_EXTENSION_VERSION;
			extensionEnabled = event.data.enabled;
			fmsDetected = event.data.fms;
			teams = event.data.teams ?? [];

			if (fmsDetected) window.postMessage({ source: "page", type: "getEventCode" }, "*");
		}
	});

	async function checkConnection() {
		window.postMessage({ source: "page", type: "ping" }, "*");
		await new Promise((resolve) => setTimeout(resolve, 3000));
		if (!extensionDetected || !extensionEnabled || !fmsDetected) {
			waitingForFirstConnectionTest = false;
			checkConnection();
		}
	}

	onMount(() => {
		window.postMessage({ source: "page", type: "ping" }, "*");
		setTimeout(() => {
			if (!extensionDetected) window.postMessage({ source: "page", type: "ping" }, "*");
		}, 500);
		setTimeout(() => {
			checkConnection();
		}, 1000);
	});

	function advance() {
		hostWizardStore.set({ notepadOnly, teams });
		navigate("/manage/host/create");
	}
</script>

{#if waitingForFirstConnectionTest}
	<div class="flex justify-center py-8">
		<div class="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
	</div>
{/if}

<div class={waitingForFirstConnectionTest ? "blur-sm pointer-events-none" : ""}>
	<h1 class="text-3xl font-bold mb-4">Extension Setup</h1>

	<p class="text-lg mb-6">
		FTA Buddy needs the Chrome extension installed and connected to FMS at
		<code class="bg-neutral-200 dark:bg-neutral-900 px-2 py-0.5 rounded-lg">10.0.100.5</code>
		to stream live field data. Make sure you have the FTA's permission to connect to run this software.
	</p>

	<div class="flex flex-col gap-3 mb-6">
		<div class="inline-flex gap-2 font-bold">
			{#if extensionDetected}
				{#if extensionUpdate}
					<Indicator color="yellow" class="my-auto" />
					<span class="text-yellow-300">
						Extension Update Available ({extensionVersion} &rarr; {LATEST_EXTENSION_VERSION})
					</span>
					<a
						href="https://chromewebstore.google.com/detail/fta-buddy/kddnhihfpfnehnnhbkfajdldlgigohjc"
						class="text-blue-400 hover:underline"
						target="_blank">Update</a
					>
				{:else if extensionEnabled}
					<Indicator color="green" class="my-auto" />
					<span class="text-green-500">Extension Enabled ({extensionVersion})</span>
				{:else}
					<Indicator color="yellow" class="my-auto" />
					<span class="text-yellow-300">Extension Not Enabled</span>
					<button
						class="text-blue-400 hover:underline"
						onclick={() => window.postMessage({ source: "page", type: "enable", fieldMonitor: true }, "*")}
						>Enable</button
					>
				{/if}
			{:else}
				<Indicator color="red" class="my-auto" />
				<span class="text-red-500">Extension Not Detected</span>
				<a
					href="https://chromewebstore.google.com/detail/fta-buddy/kddnhihfpfnehnnhbkfajdldlgigohjc"
					class="text-blue-400 hover:underline"
					target="_blank">Install</a
				>
			{/if}
		</div>
		{#if !extensionDetected}
			<div class="text-sm text-gray-500">You may have to refresh the page after installing the extension</div>
		{/if}

		<div class="inline-flex gap-2 font-bold">
			<Indicator color={fmsDetected ? "green" : "red"} class="my-auto" />
			{#if fmsDetected}
				<span class="text-green-500">FMS Detected</span>
			{:else}
				<span class="text-red-500">FMS Not Detected</span>
			{/if}
		</div>
	</div>

	<div class="flex flex-col gap-1 border border-neutral-700 rounded-xl p-4 mb-6">
		<div class="flex items-center justify-between">
			<div>
				<p class="font-semibold">Notepad Only Mode</p>
				<p class="text-sm text-gray-400">
					Disables the SignalR field monitor connection in the extension. The extension and FMS connection are
					still required. Match logs will need to be manually pulled.
				</p>
			</div>
			<Toggle bind:checked={notepadOnly} class="ml-4 shrink-0" />
		</div>
	</div>

	<Button disabled={!canAdvance} onclick={advance}>Next</Button>
</div>
