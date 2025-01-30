<script lang="ts">
	import EventStatus from "../components/EventStatus.svelte";
	import { Button, Modal, Select, type SelectOptionType } from "flowbite-svelte";
	import Icon from "@iconify/svelte";
	import { trpc } from "../main";
	import { onMount } from "svelte";

	const urlParams = new URLSearchParams(window.location.search);

	export let defaultEvents: null | string[] = null;

	onMount(() => {
		if (defaultEvents) {
			events = defaultEvents;
		}
	});

	let events: string[] =
		urlParams
			.get("events")
			?.split(",")
			.filter((e) => e !== "") || [];

	let eventList = getEventList();

	function getEventList() {
		return trpc.event.getAll.query().then((res) => res.map((e) => ({ value: e.code, name: e.code })).filter((e) => !events.includes(e.value)));
	}

	let eventSelectorOpen = false;
	let newEventCode = "";
	function addEvent() {
		if (newEventCode) {
			events.push(newEventCode);
			newEventCode = "";
			window.history.replaceState({}, "", `?events=${events.join(",")}`);
			events = events;
			eventSelectorOpen = false;
			eventList = getEventList();
		}
	}

	function removeEvent(eventCode: string) {
		events = events.filter((e) => e !== eventCode);
		window.history.replaceState({}, "", `?events=${events.join(",")}`);
		events = events;
		eventList = getEventList();
	}
</script>

{#await eventList then eventList}
	<Modal title="Select Event" bind:open={eventSelectorOpen} outsideclose>
		<Select bind:value={newEventCode} items={eventList} placeholder="Select Event" on:change={addEvent} />
	</Modal>
{/await}

<div class="flex flex-col h-full lg:ml-2 pb-2">
	<div class="grid {events.length > 0 && 'grid-cols-2'} lg:flex grow justify-center gap-2 pt-2 px-2">
		{#each events as eventCode}
			<EventStatus {eventCode} remove={removeEvent} removable={false} />
		{/each}

		{#if events.length < 4 && (window.innerWidth >= 640 || events.length === 0) && !defaultEvents}
			<div class="relative flex items-center justify-end {events.length > 0 && 'w-0 left-28'}">
				<Button
					on:click={() => {
						eventSelectorOpen = true;
					}}><Icon icon="mdi:plus" class="size-12" /></Button
				>
			</div>
		{/if}
	</div>
	{#if window.innerWidth < 640 && events.length < 4 && events.length > 0 && !defaultEvents}
		<div class="flex justify-center">
			<Button
				on:click={() => {
					eventSelectorOpen = true;
				}}
				size="sm"
				class="w-full mt-2 mx-2"><Icon icon="mdi:plus" class="size-8" /></Button
			>
		</div>
	{/if}
</div>
