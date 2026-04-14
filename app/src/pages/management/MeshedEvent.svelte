<script lang="ts">
	import { Button, Input, Label } from "flowbite-svelte";
	import { trpc } from "../../main";
	import { navigate } from "../../router";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";
	import { generateEventPassword } from "../../util/eventPassword";
	import { toast } from "../../util/toast";

	let eventCode = $state("");
	let eventPin = $state(generateEventPassword());

	const DEFAULT_COLORS = ["#3878f8", "#22c55e", "#1e3a8a", "#ea580c", "#a855f7", "#ec4899"];

	// Edit mode: we're already on a meshed event
	let isEditMode = $derived(!!$eventStore.subEvents?.length);

	let subEvents = $state(
		$eventStore.subEvents?.map((s, i) => ({
			code: s.code,
			label: s.label,
			color: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
		})) ?? [{ code: "", label: "", color: DEFAULT_COLORS[0] }],
	);

	// Keep subEvents in sync when the store changes (e.g. on initial load)
	$effect(() => {
		if ($eventStore.subEvents?.length && subEvents.every((s) => s.code === "")) {
			subEvents = $eventStore.subEvents.map((s, i) => ({
				code: s.code,
				label: s.label,
				color: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
			}));
		}
	});

	function checkIfAddSubEvent() {
		if (!isEditMode && subEvents[subEvents.length - 1].code !== "") {
			subEvents = [...subEvents, { code: "", label: "", color: DEFAULT_COLORS[subEvents.length % DEFAULT_COLORS.length] }];
		}
	}

	let blocked = $state(false);

	async function createMeshedEvent() {
		try {
			blocked = true;
			const meshedEvent = await trpc.event.createMeshedEvent.mutate({
				code: eventCode,
				pin: eventPin,
				events: subEvents.filter((subEvent) => subEvent.code !== ""),
			});
			toast("Success", "Meshed event created successfully", "green-500");
			$userStore.meshedEventToken = meshedEvent.token;
			$userStore.eventToken = meshedEvent.token;
			$eventStore.code = eventCode;
			$eventStore.pin = eventPin;
			$eventStore.teams = meshedEvent.teams;
			$eventStore.users = meshedEvent.users;
			$eventStore.subEvents = meshedEvent.subEvents;
			navigate("/dashboard");
		} catch (e) {
			console.error(e);
			if (e instanceof Error) toast("Failed to create meshed event", e.message);
		}
		blocked = false;
	}

	async function updateMeshedEventLabels() {
		try {
			blocked = true;
			const res = await trpc.event.updateMeshedEventLabels.mutate(
				subEvents.map((s) => ({ code: s.code, label: s.label, color: s.color })),
			);
			eventStore.update((e) => ({ ...e, subEvents: res.subEvents }));
			toast("Success", "Sub-event labels updated", "green-500");
			navigate("/manage/event-settings");
		} catch (e) {
			console.error(e);
			if (e instanceof Error) toast("Failed to update labels", e.message);
		}
		blocked = false;
	}
</script>

<div class="h-full overflow-y-auto">
	<div class="container mx-auto md:max-w-4xl flex flex-col justify-center p-4 gap-4">
		<h1 class="text-3xl font-bold">{isEditMode ? "Edit Meshed Event" : "Create Meshed Event"}</h1>
		<p class="text-lg">A meshed event combines multiple events into one</p>
		{#if !isEditMode}
			<p class="text-lg">
				Any user that joins this meshed event will be able to access each of the events that are part of it. There
				is also a combined view that shows all the tickets and team info from the events in one place.
			</p>
		{/if}
		<form
			class="flex flex-col gap-2 text-left"
			onsubmit={(e) => {
				e.preventDefault();
				isEditMode ? updateMeshedEventLabels() : createMeshedEvent();
			}}
		>
			{#if !isEditMode}
				<Label>
					Meshed Event Code
					<Input placeholder="2025micmp" bind:value={eventCode} disabled={blocked} />
				</Label>
				<Label>
					Meshed Event Password
					<Input bind:value={eventPin} placeholder="robot-field-42" disabled={blocked} />
				</Label>
			{/if}
			<Label class="mt-2">Sub Events</Label>
			{#each subEvents as subEvent, i}
				<div class="flex gap-2 items-center">
					<input
						type="color"
						bind:value={subEvent.color}
						disabled={blocked}
						class="h-9 w-10 cursor-pointer rounded border border-gray-300 dark:border-gray-600 bg-transparent p-0.5"
						title="Sub-event color"
					/>
					<Input
						placeholder="2025micmp{i + 1}"
						bind:value={subEvent.code}
						onkeydown={checkIfAddSubEvent}
						disabled={blocked || isEditMode}
					/>
					<Input
						placeholder={["DTE", "Hemlock", "Consumers", "Aptive"][i]}
						bind:value={subEvent.label}
						disabled={blocked}
					/>
					{#if !isEditMode}
						<Button
							onclick={() => (subEvents = subEvents.filter((_, index) => index !== i))}
							disabled={subEvents.length <= 1 || blocked}>Remove</Button
						>
					{/if}
				</div>
			{/each}
			{#if isEditMode}
				<div class="flex gap-2 mt-2">
					<Button type="submit" disabled={blocked}>Save Labels</Button>
					<Button color="alternative" onclick={() => navigate("/manage/event-settings")} disabled={blocked}>Cancel</Button>
				</div>
			{:else}
				<Button class="mt-2" onclick={createMeshedEvent} disabled={!eventCode || !eventPin || blocked}
					>Create Meshed Event</Button
				>
			{/if}
		</form>
	</div>
</div>
