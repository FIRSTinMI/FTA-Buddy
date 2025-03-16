<script lang="ts">
	import { Button, Helper, Indicator, Input, Label } from "flowbite-svelte";
	import { onMount } from "svelte";
	import { userStore } from "../../stores/user";
	import { eventStore } from "../../stores/event";
	import { navigate } from "svelte-routing";

	export let toast: (title: string, text: string, color?: string) => void;

	let extensionDetected = false;
	let extensionEnabled = false;
	let signalREnabled = false;
	let extensionEventCode = "";
	let extensionVersion = "unknown version";
	let fmsDetected = false;

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
	});
</script>

<div class="container mx-auto md:max-w-4xl flex flex-col justify-center p-4 h-full space-y-4">
	<h1 class="text-3xl font-bold">Host a FTA Buddy Instance</h1>
	<span class="inline-flex gap-2 font-bold mx-auto">
		{#if extensionDetected}
			{#if extensionEnabled}
				{#if signalREnabled}
					<Indicator color="green" class="my-auto" />
					<span class="text-green text-green-500">Extension Enabled ({extensionVersion})</span>
				{:else}
					<Indicator color="red" class="my-auto" />
					<span class="text-red-500">SignalR Not Enabled</span>
					<button class="text-blue-400 hover:underline" on:click={() => window.postMessage({ source: "page", type: "enableSignalR" }, "*")}
						>Enable</button
					>
				{/if}
			{:else}
				<Indicator color="yellow" class="my-auto" />
				<span class="text-yellow-300">Extension Not Enabled</span>
				<button
					class="text-blue-400 hover:underline"
					on:click={() => {
						window.postMessage({ source: "page", type: "enable" }, "*");
						window.postMessage({ source: "page", type: "enableSignalR" }, "*");
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
	<div class="flex flex-col border-t border-neutral-500 pt-5 gap-4">
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
		<div class="flex flex-col gap-4">
			<h2 class="text-xl font-bold">WPA Kiosk Tool</h2>

			<span class="text-large">
				Connect your WPA Kiosk to WiFi and visit <code class="bg-neutral-900 px-2 py-.75 rounded-xl">ftabuddy.com/app/kiosk</code> to setup the extension
				on the kiosk. Then radio programming status will be automatically updated on the checklist!
			</span>
		</div>
		<div class="flex flex-col gap-4">
			<h2 class="text-xl font-bold">Slack Bot</h2>

			<span class="text-large">
				Add the Slack bot to your CSA channel to have tickets syncronized between FTA Buddy and the Slack channel.
				<h2 class="text-lg"><code class="bg-neutral-900 px-2 py-.75 rounded-xl">/invite @FTA Buddy</code></h2>
				<h2 class="text-lg"><code class="bg-neutral-900 px-2 py-.75 rounded-xl">/ftabuddy {$eventStore.code} {$eventStore.pin}</code></h2>
			</span>
		</div>
		<Button on:click={() => navigate("/app")}>Go to FTA Buddy</Button>
	</div>
</div>
