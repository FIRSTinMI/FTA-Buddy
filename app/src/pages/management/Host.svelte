<script lang="ts">
	import { Button, Helper, Indicator, Input, Label } from "flowbite-svelte";
	import { onMount } from "svelte";
	import { navigate } from "svelte-routing";
	import type { Profile } from "../../../../shared/types";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";

	export let toast: (title: string, text: string, color?: string) => void;

	const latestExtensionVersion = "1.22";

	let extensionDetected = false;
	let extensionEnabled = false;
	let extensionUpdate = false;
	let signalREnabled = false;
	let extensionVersion = "unknown version";
	let fmsDetected = false;
	let teams: number[] = [];

	window.addEventListener("message", async (event) => {
		if (event.data.type === "pong") {
			waitingForFirstConnectionTest = false;
			extensionDetected = true;
			extensionVersion = "v" + event.data.version;
			if (event.data.version < latestExtensionVersion) {
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
			teams = event.data.teams;
			await checkEventCode();
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

	let waitingForFirstConnectionTest = true;

	onMount(() => {
		window.postMessage({ source: "page", type: "ping" }, "*");
		setTimeout(() => {
			if (!extensionDetected) window.postMessage({ source: "page", type: "ping" }, "*");
		}, 500);
		setTimeout(() => {
			checkConnection();
		}, 1000);
	});

	let eventCode = "";
	let eventCodeHelperText = "Event code must match the code on TBA";
	let eventCodeError = false;
	let eventPin = Math.random().toString().slice(2, 6);
	let loading = false;

	async function createEvent(evt: SubmitEvent) {
		loading = true;

		try {
			const res = await trpc.event.create.query({
				code: eventCode,
				pin: eventPin,
				teams,
			});

			toast("Success", "Event created successfully", "green-500");

			console.log(res);

			userStore.set({ ...$userStore, eventToken: res.token });
			eventStore.set({
				code: eventCode,
				pin: eventPin,
				teams: res.teams as { number: string; name: string; inspected: boolean }[],
				users: res.users as Profile[],
			});

			window.postMessage({ source: "page", type: "eventCode", code: eventCode, token: res.token }, "*");

			await new Promise((resolve) => setTimeout(resolve, 500));

			navigate("/app/manage/event-created");
		} catch (err: any) {
			toast("Error Creating Event", err.message);
			console.error(err);
		}

		loading = false;
	}

	async function checkEventCode() {
		try {
			if (eventCode.length < 1) {
				eventCodeHelperText = "Event code must match the code on TBA";
				eventCodeError = false;
				return;
			}
			if (eventCode.length < 6) {
				eventCodeHelperText = "Event code must be at least 6 characters";
				eventCodeError = true;
				return;
			}
			const res = await trpc.event.checkCode.query({ code: eventCode });
			console.log(res);
			if (res.error) {
				eventCodeHelperText = res.message;
				eventCodeError = true;
			} else {
				if ("eventData" in res) eventCodeHelperText = res.eventData.name;
				eventCodeError = false;
			}
		} catch (err: any) {
			eventCodeHelperText = err.message;
			eventCodeError = true;
		}
	}

	$: blockSubmit = !(eventCode.length > 6 && eventPin.length >= 4 && !loading && fmsDetected && extensionDetected && extensionEnabled && !eventCodeError);
</script>

{#if waitingForFirstConnectionTest}
	<Spinner />
{/if}

<div class="container mx-auto md:max-w-4xl flex flex-col justify-center p-4 h-full space-y-4 {waitingForFirstConnectionTest ? 'blur' : ''}">
	<h1 class="text-3xl font-bold">Host a FTA Buddy Instance</h1>
	<div>
		<div class="inline-flex gap-2 font-bold mx-auto">
			{#if extensionDetected}
				{#if extensionUpdate}
					<Indicator color="yellow" class="my-auto" />
					<span class="text-yellow-300">Extension Update Available ({extensionVersion} &rarr; {latestExtensionVersion})</span>
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
					<button class="text-blue-400 hover:underline" on:click={() => window.postMessage({ source: "page", type: "enable" }, "*")}>Enable</button>
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
	<p class="text-lg">
		FTA Buddy needs a host to send data to it from FMS. The extension must be installed and be able to communicate with FMS at
		<code class="bg-neutral-200 dark:bg-neutral-900 px-2 py-.75 rounded-lg">10.0.100.5</code>
	</p>
	<form class="grid gap-3 text-left" on:submit|preventDefault={createEvent}>
		<div>
			<Label for="event-code">Event Code</Label>
			<Input
				id="event-code"
				bind:value={eventCode}
				placeholder="2024mitry"
				on:keyup={checkEventCode}
				class="mt-1"
				color={eventCodeError ? "red" : "base"}
			/>
			<Helper class="text-sm mt-1" color={eventCodeError ? "red" : undefined}>{eventCodeHelperText}</Helper>
		</div>
		<div>
			<Label for="event-pin" disabled={loading}>Event Pin</Label>
			<Input id="event-pin" bind:value={eventPin} disabled={loading} class="mt-1" />
		</div>
		<Button type="submit" bind:disabled={blockSubmit}>Create Event</Button>
	</form>
</div>
