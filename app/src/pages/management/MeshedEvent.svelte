<script lang="ts">
	import { Button, Input, Label } from "flowbite-svelte";
	import { trpc } from "../../main";
	import { toast } from "../../../../shared/toast";
	import { userStore } from "../../stores/user";
	import { eventStore } from "../../stores/event";
	import { navigate } from "svelte-routing";

	let eventCode = "";
	let eventPin = Math.random().toString().slice(2, 6);

	let subEvents = [
		{
			code: "",
			label: "",
		},
	];

	function checkIfAddSubEvent() {
		if (subEvents[subEvents.length - 1].code !== "") {
			subEvents = [...subEvents, { code: "", label: "" }];
		}
	}

	let blocked = false;
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
			navigate("/app/manage/login");
		} catch (e) {
			console.error(e);
			if (e instanceof Error) toast("Failed to create meshed event", e.message);
		}
		blocked = false;
	}
</script>

<div class="container mx-auto md:max-w-4xl flex flex-col justify-center p-4 h-full gap-4">
	<h1 class="text-3xl font-bold">Create Meshed Event</h1>
	<p class="text-lg">A meshed event combines multiple events into one</p>
	<p class="text-lg">
		Any user that joins this meshed event will be able to access each of the events that are part of it. There is also a combined view that shows all the
		tickets and team info from the events in one place.
	</p>
	<form class="flex flex-col gap-2 text-left" on:submit|preventDefault={createMeshedEvent}>
		<Label>
			Meshed Event Code
			<Input label="Event Code" placeholder="2025micmp" bind:value={eventCode} disabled={blocked} />
		</Label>
		<Label>
			Meshed Event Pin
			<Input label="Event Pin" bind:value={eventPin} disabled={blocked} />
		</Label>
		<Label class="mt-2">Sub Events</Label>
		{#each subEvents as subEvent, i}
			<div class="flex gap-2">
				<Input label="Event Code" placeholder="2025micmp{i + 1}" bind:value={subEvent.code} on:keydown={checkIfAddSubEvent} disabled={blocked} />
				<Input label="Label" placeholder={["DTE", "Hemlock", "Consumers", "Aptive"][i]} bind:value={subEvent.label} disabled={blocked} />
				<Button on:click={() => (subEvents = subEvents.filter((_, index) => index !== i))} disabled={subEvents.length <= 1 || blocked}>Remove</Button>
			</div>
		{/each}
		<Button class="mt-2" on:click={createMeshedEvent} disabled={!eventCode || !eventPin || blocked}>Create Meshed Event</Button>
	</form>
</div>
