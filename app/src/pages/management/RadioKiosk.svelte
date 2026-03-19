<script lang="ts">
	import { Button, Helper, Indicator, Input, Label } from "flowbite-svelte";
	import { onMount } from "svelte";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { toast } from "../../util/toast";
	import { LATEST_EXTENSION_VERSION } from "../../util/updater";

	let extensionDetected = $state(false);
	let extensionEnabled = $state(false);
	let extensionUpdate = $state(false);
	let signalREnabled = $state(false);
	let extensionVersion = $state("unknown version");
	let fmsDetected = $state(false);

	window.addEventListener("message", (event) => {
		if (event.data.type === "pong") {
			waitingForFirstConnectionTest = false;
			extensionDetected = true;
			extensionVersion = "v" + event.data.version;
			if (event.data.version < LATEST_EXTENSION_VERSION) {
				extensionUpdate = true;
			} else {
				extensionUpdate = false;
			}
			extensionEnabled = event.data.enabled;
			signalREnabled = event.data.signalR;
			fmsDetected = event.data.fms;

			// If fms is detect lets try to auto fill the event code
			if (fmsDetected) window.postMessage({ source: "page", type: "getEventCode" }, "*");
		} else if (event.data.type === "eventCode") {
			if (eventCode.length < 1) {
				eventCode = event.data.code.toLowerCase();
			}
		}
	});

	async function checkConnection() {
		window.postMessage({ source: "page", type: "ping" }, "*");
		await new Promise((resolve) => setTimeout(resolve, 3000));
		if (!extensionDetected || !extensionEnabled || !signalREnabled || !fmsDetected) {
			waitingForFirstConnectionTest = false;
			checkConnection();
		}
	}

	let waitingForFirstConnectionTest = $state(true);

	onMount(() => {
		window.postMessage({ source: "page", type: "ping" }, "*");
		setTimeout(() => {
			if (!extensionDetected) window.postMessage({ source: "page", type: "ping" }, "*");
		}, 500);
		setTimeout(() => {
			checkConnection();
		}, 1000);
	});

	let eventCode = $state("");
	let eventCodeHelperText = "Event code must match the code on TBA";
	let eventCodeError = $state(false);
	let eventPin = $state("");
	let loading = $state(false);

	let blockSubmit = $derived(
		!(eventCode.length > 6 && eventPin.length >= 5 && !loading && extensionDetected && extensionEnabled),
	);

	async function setupExtension(evt: SubmitEvent) {
		evt.preventDefault();
		if (blockSubmit) return;

		try {
			loading = true;
			const eventToken = await trpc.event.getEventToken.query({
				code: eventCode,
				pin: eventPin,
			});

			window.postMessage({ source: "page", type: "eventCode", code: eventCode, token: eventToken }, "*");
			toast("Success", "Extension setup successfully", "green-500");
		} catch (err) {
			console.error(err);
			if (err instanceof Error) toast("Error", err.message, "red-500");
		} finally {
			loading = false;
		}
	}
</script>

{#if waitingForFirstConnectionTest}
	<Spinner />
{/if}

<div
	class="container mx-auto md:max-w-4xl flex flex-col justify-center p-4 h-full space-y-4 overflow-y-auto {waitingForFirstConnectionTest
		? 'blur-sm'
		: ''}"
>
	<h1 class="text-3xl font-bold">Setup Radio Kiosk Extension</h1>
	<div>
		<div class="inline-flex gap-2 font-bold mx-auto">
			{#if extensionDetected}
				{#if extensionUpdate}
					<Indicator color="yellow" class="my-auto" />
					<span class="text-yellow-300"
						>Extension Update Available ({extensionVersion} &rarr; {LATEST_EXTENSION_VERSION})</span
					>
					<a
						href="https://chromewebstore.google.com/detail/fta-buddy/kddnhihfpfnehnnhbkfajdldlgigohjc"
						class="text-blue-400 hover:underline"
						target="_blank">Update</a
					>
				{:else if extensionEnabled}
					<Indicator color="green" class="my-auto" />
					<span class="text-green text-green-500">Extension Enabled ({extensionVersion})</span>
				{:else}
					<Indicator color="yellow" class="my-auto" />
					<span class="text-yellow-300">Extension Not Enabled</span>
					<button
						class="text-blue-400 hover:underline"
						onclick={() => window.postMessage({ source: "page", type: "enable" }, "*")}>Enable</button
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
	</div>
	<span class="inline-flex gap-2 font-bold mx-auto">
		<Indicator color={fmsDetected ? "green" : "red"} class="my-auto" />
		{#if fmsDetected}
			<span class="text-green-500">FMS Detected</span>
		{:else}
			<span class="text-red-500">FMS Not Detected</span>
		{/if}
	</span>
	<form class="grid gap-3 text-left" onsubmit={setupExtension}>
		<div>
			<Label for="event-code">Event Code</Label>
			<Input
				id="event-code"
				bind:value={eventCode}
				placeholder="2024mitry"
				class="mt-1"
				color={eventCodeError ? "red" : undefined}
			/>
			<Helper class="text-sm mt-1" color={eventCodeError ? "red" : undefined}>{eventCodeHelperText}</Helper>
		</div>
		<div>
			<Label for="event-pin">Event Password</Label>
			<Input id="event-pin" bind:value={eventPin} placeholder="robot-field-42" disabled={loading} class="mt-1" />
		</div>
		<Button type="submit" disabled={blockSubmit}>Setup Extension</Button>
	</form>
</div>
