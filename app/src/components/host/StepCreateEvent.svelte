<script lang="ts">
	import { Button, Helper, Input, Label } from "flowbite-svelte";
	import { onMount } from "svelte";
	import type { Profile } from "../../../../shared/types";
	import { trpc } from "../../main";
	import { navigate } from "../../router";
	import { eventStore } from "../../stores/event";
	import { hostWizardStore } from "../../stores/hostWizard";
	import { userStore } from "../../stores/user";
	import { generateEventPassword } from "../../util/eventPassword";
	import { toast } from "../../util/toast";

	let notepadOnly = $hostWizardStore.notepadOnly;
	let teams = $hostWizardStore.teams;

	let eventCode = $state("");
	let eventCodeHelperText = $state("Event code must match the code on TBA");
	let eventCodeError = $state(false);
	let eventPin = $state(generateEventPassword());
	let loading = $state(false);
	let tbaKey: string | undefined = $state(undefined);
	let autofilledKey: string | undefined = undefined;

	let blockSubmit = $derived(!(eventCode.length > 6 && eventPin.length >= 5 && !loading && !eventCodeError));

	window.addEventListener("message", (event) => {
		if (event.data.type === "eventCode") {
			if (eventCode.length < 1) {
				eventCode = event.data.code.toLowerCase();
				autofilledKey = event.data.code.toLowerCase();
			}
			teams = event.data.teams ?? teams;
			checkEventCode();
		}
	});

	onMount(() => {
		window.postMessage({ source: "page", type: "getEventCode" }, "*");
	});

	let checkEventCodeTimeout: ReturnType<typeof setTimeout> | null = null;

	function checkEventCodeDebounced() {
		if (checkEventCodeTimeout) clearTimeout(checkEventCodeTimeout);
		checkEventCodeTimeout = setTimeout(() => checkEventCode(), 500);
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

	async function createEvent(evt: SubmitEvent) {
		evt.preventDefault();
		loading = true;
		try {
			const res = await trpc.event.create.mutate({ code: eventCode, pin: eventPin, teams, notepadOnly });

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

			navigate("/manage/event-settings");
		} catch (err: any) {
			toast("Error Creating Event", err.message);
			console.error(err);
		}
		loading = false;
	}
</script>

<div class="flex items-center gap-3 mb-6">
	<h1 class="text-3xl font-bold">Create Event</h1>
	{#if notepadOnly}
		<span
			class="text-xs font-semibold bg-yellow-700/40 text-yellow-300 border border-yellow-600 rounded-full px-3 py-0.5"
		>
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
		<Label for="event-pin">Event Password</Label>
		<Input id="event-pin" bind:value={eventPin} placeholder="robot-field-42" disabled={loading} class="mt-1" />
	</div>
	<Button type="submit" disabled={blockSubmit}>
		{loading ? "Creating…" : "Create Event"}
	</Button>
</form>
