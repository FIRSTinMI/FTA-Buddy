<script lang="ts">
	import { Button, Helper, Indicator, Input, Label, Toggle } from "flowbite-svelte";
	import { onMount } from "svelte";
	import type { Profile } from "../../../../shared/types";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { navigate } from "../../router";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";
	import { toast } from "../../util/toast";
	import { LATEST_EXTENSION_VERSION } from "../../util/updater";

	// ── wizard step ──────────────────────────────────────────────────────────
	let step = $state(1); // 1 = extension setup, 2 = event code / pin

	// ── extension / FMS status ───────────────────────────────────────────────
	let extensionDetected = $state(false);
	let extensionEnabled = $state(false);
	let extensionUpdate = $state(false);
	let signalREnabled = $state(false);
	let extensionVersion = $state("unknown version");
	let fmsDetected = $state(false);
	let teams: number[] = [];

	// ── notepad-only mode ────────────────────────────────────────────────────
	let notepadOnly = $state(false);

	window.addEventListener("message", async (event) => {
		if (event.data.type === "pong") {
			waitingForFirstConnectionTest = false;
			extensionDetected = true;
			extensionVersion = "v" + event.data.version;
			extensionUpdate = event.data.version < LATEST_EXTENSION_VERSION;
			extensionEnabled = event.data.enabled;
			signalREnabled = event.data.signalR;
			fmsDetected = event.data.fms;

			// If FMS is detected try to auto-fill the event code (step 2)
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

	// ── step-1 gate ──────────────────────────────────────────────────────────
	let canAdvance = $derived(notepadOnly || (extensionDetected && extensionEnabled && fmsDetected));

	// ── step-2 form ──────────────────────────────────────────────────────────
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
				notepadOnly,
			});

			toast("Success", "Event created successfully", "green-500");

			userStore.set({ ...$userStore, eventToken: res.token });
			eventStore.set({
				code: eventCode,
				pin: eventPin,
				teams: res.teams as { number: string; name: string; inspected: boolean }[],
				users: res.users as Profile[],
				notepadOnly,
			});

			window.postMessage(
				{ source: "page", type: "eventCode", code: eventCode, token: res.token, fieldMonitor: !notepadOnly },
				"*",
			);

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
			if (res.error) {
				if (res.key) {
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
		!(eventCode.length > 6 && eventPin.length >= 4 && !loading && !eventCodeError),
	);
</script>

{#if waitingForFirstConnectionTest}
	<Spinner />
{/if}

<div
	class="container mx-auto md:max-w-4xl flex flex-col justify-center p-4 h-full space-y-6 overflow-y-auto {waitingForFirstConnectionTest
		? 'blur-sm'
		: ''}"
>
	<!-- Step indicator -->
	<div class="flex items-center gap-3">
		<div class="flex items-center gap-2">
			<span
				class="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold
					{step >= 1 ? 'bg-blue-600 text-white' : 'bg-neutral-700 text-neutral-400'}"
			>1</span>
			<span class="text-sm font-medium {step === 1 ? 'text-white' : 'text-neutral-400'}">Extension Setup</span>
		</div>
		<div class="h-px w-8 bg-neutral-600"></div>
		<div class="flex items-center gap-2">
			<span
				class="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold
					{step >= 2 ? 'bg-blue-600 text-white' : 'bg-neutral-700 text-neutral-400'}"
			>2</span>
			<span class="text-sm font-medium {step === 2 ? 'text-white' : 'text-neutral-400'}">Create Event</span>
		</div>
	</div>

	<!-- ── Step 1: Extension Setup ─────────────────────────────────────────── -->
	{#if step === 1}
		<h1 class="text-3xl font-bold">Extension Setup</h1>

		<p class="text-lg">
			FTA Buddy needs the Chrome extension installed and connected to FMS at
			<code class="bg-neutral-200 dark:bg-neutral-900 px-2 py-0.5 rounded-lg">10.0.100.5</code>
			to stream live field data.
		</p>

		<!-- Status indicators, dimmed when notepadOnly -->
		<div class="flex flex-col gap-3 {notepadOnly ? 'opacity-40 pointer-events-none select-none' : ''}">
			<!-- Extension status -->
			<div>
				<div class="inline-flex gap-2 font-bold">
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
							<span class="text-green-500">Extension Enabled ({extensionVersion})</span>
						{:else}
							<Indicator color="yellow" class="my-auto" />
							<span class="text-yellow-300">Extension Not Enabled</span>
							<button
								class="text-blue-400 hover:underline"
								onclick={async () => {
									await window.postMessage({ source: "page", type: "enable", fieldMonitor: true }, "*");
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
					<div class="text-sm text-gray-500 mt-1">You may have to refresh the page after installing the extension</div>
				{/if}
			</div>

			<!-- FMS status -->
			<span class="inline-flex gap-2 font-bold">
				<Indicator color={fmsDetected ? "green" : "red"} class="my-auto" />
				{#if fmsDetected}
					<span class="text-green-500">FMS Detected</span>
				{:else}
					<span class="text-red-500">FMS Not Detected</span>
				{/if}
			</span>
		</div>

		<!-- Notepad-only toggle -->
		<div class="flex flex-col gap-1 border border-neutral-700 rounded-xl p-4">
			<div class="flex items-center justify-between">
				<div>
					<p class="font-semibold">Notepad Only Mode</p>
					<p class="text-sm text-gray-400">
						Skip the extension requirement. You can still manually import match logs and use FMS API
						endpoints, but live field data won't stream.
					</p>
				</div>
				<Toggle bind:checked={notepadOnly} class="ml-4 shrink-0" />
			</div>
		</div>

		<Button disabled={!canAdvance} onclick={() => (step = 2)}>
			Next &rarr;
		</Button>
	{/if}

	<!-- ── Step 2: Create Event ────────────────────────────────────────────── -->
	{#if step === 2}
		<div class="flex items-center gap-3">
			<button class="text-blue-400 hover:underline text-sm" onclick={() => (step = 1)}>&larr; Back</button>
			<h1 class="text-3xl font-bold">Create Event</h1>
			{#if notepadOnly}
				<span class="text-xs font-semibold bg-yellow-700/40 text-yellow-300 border border-yellow-600 rounded-full px-3 py-0.5">
					Notepad Only
				</span>
			{/if}
		</div>

		<form class="grid gap-3 text-left" onsubmit={createEvent}>
			<div>
				<Label for="event-code">Event Code</Label>
				<Input
					id="event-code"
					bind:value={eventCode}
					placeholder="2026mitry"
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
			<Button type="submit" disabled={blockSubmit}>
				{loading ? "Creating…" : "Create Event"}
			</Button>
		</form>
	{/if}
</div>
