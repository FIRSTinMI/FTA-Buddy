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
				<Indicator color="green" class="my-auto" />
				<span class="text-green text-green-500">Extension Enabled ({extensionVersion})</span>
			{:else}
				<Indicator color="yellow" class="my-auto" />
				<span class="text-yellow-300">Extension Not Enabled</span>
				<button class="text-blue-400 hover:underline" on:click={() => window.postMessage({ source: "page", type: "enable" }, "*")}>Enable</button>
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
		You can use FTA Buddy as your primary field monitor by enabling the SignalR option, or use the FTA Buddy extension with the regular FMS field monitor.
	</p>
	<div class="grid md:grid-cols-2 border-t border-neutral-500 pt-5 gap-4">
		<div class="col-span-2 border-b border-neutral-500 pb-5">
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
			<h2 class="text-xl font-bold">Use FTA Buddy as your primary field monitor</h2>

			<span class="inline-flex gap-2 font-bold mx-auto">
				{#if signalREnabled}
					<Indicator color="green" class="my-auto" />
					<span class="text-green-500">SignalR Enabled</span>
				{:else}
					<Indicator color="red" class="my-auto" />
					<span class="text-red-500">SignalR Not Enabled</span>
					<button class="text-blue-400 hover:underline" on:click={() => window.postMessage({ source: "page", type: "enableSignalR" }, "*")}
						>Enable</button
					>
				{/if}
			</span>
			{#if !fmsDetected}
				<p class="font-bold text-red-500">Please ensure that FMS is detected.</p>
			{:else if !extensionDetected}
				<p class="font-bold text-red-500">Please install the FTA Buddy extension.</p>
			{:else if extensionVersion < "1.8"}
				<p class="font-bold text-red-500">Please update the FTA Buddy extension to the latest version.</p>
			{:else if !extensionEnabled}
				<p class="font-bold text-red-500">Please enable the FTA Buddy extension.</p>
			{:else if !signalREnabled}
				<p class="font-bold text-red-500">Please enable SignalR to use FTA Buddy as your primary field monitor.</p>
			{:else if extensionEventCode !== $eventStore.code}
				<p class="font-bold text-red-500">Please use the same event code as the extension.</p>
			{/if}
		</div>
		<div class="flex flex-col gap-4">
			<h2 class="text-xl font-bold">Use the FTA Buddy extension with the regular FMS field monitor</h2>

			{#if !fmsDetected}
				<p class="font-bold text-red-500">Please ensure that FMS is detected.</p>
			{:else if !extensionDetected}
				<p class="font-bold text-red-500">Please install the FTA Buddy extension.</p>
			{:else if !extensionEnabled}
				<p class="font-bold text-red-500">Please enable the FTA Buddy extension.</p>
			{:else if extensionEventCode !== $eventStore.code}
				<p class="font-bold text-red-500">Please use the same event code as the extension.</p>
			{/if}
		</div>
		<Button on:click={() => navigate("/app")}>Go to FTA Buddy</Button>
		<Button href="http://10.0.100.5/FieldMonitor">Go to Field Monitor</Button>
	</div>
</div>
