<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Modal, Select } from "flowbite-svelte";
	import { onMount } from "svelte";
	import EventStatus from "../components/EventStatus.svelte";
	import { trpc } from "../main";
	import { eventStore } from "../stores/event";
	import { userStore } from "../stores/user";

	const urlParams = new URLSearchParams(window.location.search);

	// let { defaultEvents = null }: { defaultEvents: null | string[] } = $props();
	let defaultEvents: string[] | null = null;

	let events: string[] = $state(
		urlParams
			.get("events")
			?.split(",")
			.filter((e) => e !== "") || [],
	);

	type SelectItem = { value: string; name: string };
	let eventOptions: SelectItem[] = $state([]);
	let loadingOptions = $state(false);

	async function loadEventOptions() {
		loadingOptions = true;
		try {
			const res = await trpc.event.getAll.query();
			eventOptions = res
				.filter((e) => e.created_at > new Date(Date.now() - 1000 * 60 * 60 * 24 * 5))
				.map((e) => ({ value: e.code, name: e.name }))
				.filter((e) => !events.includes(e.value));
		} finally {
			loadingOptions = false;
		}
	}

	onMount(async () => {
		if (defaultEvents) {
			events = defaultEvents;
			window.history.replaceState({}, "", `?events=${events.join(",")}`);
		} else if ($userStore.meshedEventToken) {
			events = $eventStore.subEvents?.map((e) => e.code) || [];
			window.history.replaceState({}, "", `?events=${events.join(",")}`);
		} else if (events.length === 0) {
			// Auto-open any events that currently have an active FMS connection.
			try {
				const active = await trpc.event.getActive.query();
				if (active.length > 0) {
					events = active.map((e) => e.code);
					window.history.replaceState({}, "", `?events=${events.join(",")}`);
				}
			} catch {
				// Silently ignore - user can still add events manually.
			}
		}

		await loadEventOptions();
	});

	let eventSelectorOpen = $state(false);
	let newEventCode = $state("");

	async function addEvent() {
		if (!newEventCode) return;

		events = [...events, newEventCode];
		newEventCode = "";
		window.history.replaceState({}, "", `?events=${events.join(",")}`);

		eventSelectorOpen = false;
		await loadEventOptions();
	}

	async function removeEvent(eventCode: string) {
		events = events.filter((e) => e !== eventCode);
		window.history.replaceState({}, "", `?events=${events.join(",")}`);
		await loadEventOptions();
	}
</script>

<Modal title="Select Event" bind:open={eventSelectorOpen} outsideclose>
	<Select
		bind:value={newEventCode}
		items={eventOptions}
		placeholder={loadingOptions ? "Loading..." : "Select Event"}
		disabled={loadingOptions}
		onchange={addEvent}
	/>
</Modal>

<div class="flex flex-col h-full lg:ml-2 pb-2">
	<div
		class="grid {events.length > 0 &&
			(events.length > 4 ? 'grid-cols-3' : 'grid-cols-2')} lg:flex grow justify-center gap-2 pt-2 px-2"
	>
		{#each events as eventCode}
			<EventStatus {eventCode} remove={removeEvent} removable={false} />
		{/each}

		{#if events.length < 4 && (window.innerWidth >= 640 || events.length === 0) && !defaultEvents}
			<div class="relative flex items-center justify-end {events.length > 0 && 'w-0 left-28'}">
				<Button onclick={() => (eventSelectorOpen = true)}>
					<Icon icon="mdi:plus" class="size-12" />
				</Button>
			</div>
		{:else if events.length < 6 && (window.innerWidth >= 640 || events.length === 0) && !defaultEvents}
			<div class="relative flex items-end justify-end {events.length > 0 && 'w-0 right-8 bottom-8'}">
				<Button class="h-16" onclick={() => (eventSelectorOpen = true)}>
					<Icon icon="mdi:plus" class="size-12" />
				</Button>
			</div>
		{/if}
	</div>

	{#if window.innerWidth < 640 && events.length < 6 && events.length > 0 && !defaultEvents}
		<div class="flex justify-center">
			<Button size="sm" class="w-full mt-2 mx-2" onclick={() => (eventSelectorOpen = true)}>
				<Icon icon="mdi:plus" class="size-8" />
			</Button>
		</div>
	{/if}
</div>
