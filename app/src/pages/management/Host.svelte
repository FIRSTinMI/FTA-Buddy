<script lang="ts">
	import { Button, Helper, Indicator, Input, Label } from "flowbite-svelte";
	import { onMount } from "svelte";
	import type { Profile } from "../../../../shared/types";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { navigate } from "../../router";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";
	import { toast } from "../../util/toast";
	import { LATEST_EXTENSION_VERSION } from "../../util/updater";

	let extensionDetected = $state(false);
	let extensionEnabled = $state(false);
	let extensionUpdate = $state(false);
	let signalREnabled = $state(false);
	let extensionVersion = $state("unknown version");
	let fmsDetected = $state(false);
	let teams: number[] = [];

	window.addEventListener("message", async (event) => {
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
				autofilledKey = event.data.code.toLowerCase();
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
	let eventCodeHelperText = $state("Event code must match the code on TBA");
	let eventCodeError = $state(false);
	let eventPin = $state(Math.random().toString().slice(2, 6));
	let loading = $state(false);

	let tbaKey: string | undefined = $state(undefined);
	let autofilledKey: string | undefined = undefined;

	async function createEvent(evt: SubmitEvent) {
		evt.preventDefault();
		loading = true;
		try {
			const res = await trpc.event.create.mutate({
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

			navigate("/manage/event-created");
		} catch (err: any) {
			toast("Error Creating Event", err.message);
			console.error(err);
		}

		loading = false;
	}

	let checkEventCodeTimeout: ReturnType<typeof setTimeout> | null = null;

	function checkEventCodeDebounced() {
		if (checkEventCodeTimeout) clearTimeout(checkEventCodeTimeout);
		checkEventCodeTimeout = setTimeout(() => {
			checkEventCode();
		}, 500);
	}

	async function checkEventCode() {
		tbaKey = undefined;
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
				if (res.key) {
					// If the current event code was autofilled from FMS, just replace the code and don't prompt the user
					// Make sure it doesn't match autofilledKey to prevent a loop
					if (eventCode === autofilledKey && res.key !== autofilledKey) {
						eventCode = res.key;
						checkEventCode();
					} else {
						eventCodeHelperText = "Did you mean to use the TBA key? ";
						eventCodeError = true;
						tbaKey = res.key;
					}
				} else {
					eventCodeHelperText = res.message;
					eventCodeError = true;
				}
			} else {
				if ("eventData" in res) eventCodeHelperText = res.eventData.name;
				eventCodeError = false;
			}
		} catch (err: any) {
			eventCodeHelperText = err.message;
			eventCodeError = true;
		}
	}

	let blockSubmit = $derived(
		!(
			eventCode.length > 6 &&
			eventPin.length >= 4 &&
			!loading &&
			fmsDetected &&
			extensionDetected &&
			extensionEnabled &&
			!eventCodeError
		),
	);
</script>

{#if waitingForFirstConnectionTest}
	<Spinner />
{/if}

<div
	class="container mx-auto md:max-w-4xl flex flex-col justify-center p-4 h-full space-y-4 overflow-y-auto {waitingForFirstConnectionTest
		? 'blur-sm'
		: ''}"
>
	<h1 class="text-3xl font-bold">Host a FTA Buddy Instance</h1>
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
						onclick={async () => {
							await window.postMessage({ source: "page", type: "enable" }, "*");
						}}>Enable</button
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
	<p class="text-lg">
		FTA Buddy needs a host to send data to it from FMS. The extension must be installed and be able to communicate
		with FMS at
		<code class="bg-neutral-200 dark:bg-neutral-900 px-2 py-.75 rounded-lg">10.0.100.5</code>
	</p>
	<form class="grid gap-3 text-left" onsubmit={createEvent}>
		<div>
			<Label for="event-code">Event Code</Label>
			<Input
				id="event-code"
				bind:value={eventCode}
				placeholder="2024mitry"
				onkeyup={checkEventCodeDebounced}
				class="mt-1"
				color={eventCodeError ? "red" : undefined}
			/>
			<Helper class="text-sm mt-1" color={eventCodeError ? "red" : undefined}>
				{eventCodeHelperText}
				{#if tbaKey}
					<button
						class="text-blue-400 hover:underline"
						type="button"
						onclick={() => {
							eventCode = tbaKey ?? "";
							checkEventCode();
						}}>{tbaKey}</button
					>
				{/if}
			</Helper>
		</div>
		<div>
			<Label for="event-pin">Event Pin</Label>
			<Input id="event-pin" bind:value={eventPin} disabled={loading} class="mt-1" />
		</div>
		<Button type="submit" disabled={blockSubmit}>Create Event</Button>
	</form>
</div>
