<script lang="ts">
	import Icon from "@iconify/svelte";
	import { onMount } from "svelte";
	import { formatTime } from "../../../../shared/formatTime";
	import type { EventState } from "../../../../src/router/field-monitor";
	import { trpc } from "../../main";
	import { userStore } from "../../stores/user";

	let subscription: ReturnType<typeof trpc.field.management.subscribe> | null = null;

	let events: EventState[] = [];

	let hearts: { [k: string]: boolean } = {};

	onMount(() => {
		if (subscription) {
			subscription.unsubscribe();
		}
		subscription = trpc.field.management.subscribe(
			{
				token: $userStore.token,
			},
			{
				onData: (data) => {
					console.log(data);
					hearts[data.code] = true;
					setTimeout(() => {
						hearts[data.code] = false;
					}, 250);
					let event = events.find((e) => e.code === data.code);
					if (event) {
						event = { ...event, ...data };
					} else {
						events.push(data);
					}
					events = events.sort((a, b) => {
						if (a.extensions.length === b.extensions.length) {
							if (a.extensions.length === 0) {
								return a.code.localeCompare(b.code);
							} else {
								const aDate = a.extensions[0].lastFrame;
								const bDate = b.extensions[0].lastFrame;
								return bDate.toISOString().split("T")[1].localeCompare(aDate.toISOString().split("T")[1]);
							}
						}
						return b.extensions.length - a.extensions.length;
					});
				},
			}
		);
	});

	const FieldStates = {
		0: "Unknown",
		1: "Match Running Teleop",
		2: "Match Transistioning",
		3: "Match Running Auto",
		4: "Match Ready",
		5: "Prestart Completed",
		6: "Prestart Initiated",
		7: "Ready to Prestart",
		8: "Match Aborted",
		9: "Match Over",
		10: "Ready for Post Result",
		11: "Match Not Ready",
	};
</script>

<div class="grid grid-cols-6 gap-2 mx-auto max-w-5xl">
	<p>Name</p>
	<p>Field State</p>
	<p>Match</p>
	<p>Ahead Behind</p>
	<p>Exact</p>
	<p>Heartbeat</p>
	{#each events as event}
		<p>{event.code} - {event.name}</p>
		<p>{FieldStates[event.field]}</p>
		<p>{event.level} - {event.match}</p>
		<p>{event.aheadBehind}</p>
		<p>{event.exactAheadBehind}</p>
		<p><Icon icon="mdi:favorite" class="w-8 h-full py-2 mx-auto {hearts[event.code] ? 'text-green-600' : 'text-gray-500'}" /></p>
		<div class="col-span-2">
			{#each event.clients as client}
				<div class="flex items-center gap-2">
					<p>{client.ip}</p>
					<p>{client.userAgent}</p>
				</div>
			{/each}
		</div>
		<div class="col-span-4">
			{#each event.extensions as extension}
				<div class="flex items-center gap-2">
					<p>{extension.ip}</p>
					<p>{formatTime(extension.connected)}</p>
					<p>{extension.frames}</p>
					<p>{formatTime(extension.lastFrame)}</p>
					<p>{extension.checklistUpdates}</p>
				</div>
			{/each}
		</div>
	{/each}
</div>
