<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Input } from "flowbite-svelte";
	import { onMount } from "svelte";
	import { formatTime } from "../../../../shared/formatTime";
	import type { EventState } from "../../../../src/router/field-monitor";
	import { trpc } from "../../main";
	import { userStore } from "../../stores/user";

	let subscription: ReturnType<typeof trpc.field.management.subscribe> | null = null;

	let events: EventState[] = [];

	let hearts: { [k: string]: boolean } = {};

	type EventUserEntry = { id: number; username: string; role: string };
	let eventUsers: Record<string, EventUserEntry[]> = {};

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
								return bDate
									.toISOString()
									.split("T")[1]
									.localeCompare(aDate.toISOString().split("T")[1]);
							}
						}
						return b.extensions.length - a.extensions.length;
					});
				},
			},
		);

		if ($userStore.admin) {
			trpc.event.getAllWithUsers.query().then((data) => {
				eventUsers = Object.fromEntries(data.map((e) => [e.code, e.users]));
			}).catch((err) => {
				console.error("[Management] getAllWithUsers failed:", err);
			});
		}
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

	let message = "";
	let effectedEvents = "";

	async function startIssue(message: string, effectedEvents: string[]) {
		console.log(
			await trpc.app.startIssue.mutate({
				message,
				effectedEvents: effectedEvents.filter((e) => e !== ""),
			}),
		);
	}

	async function endIssue() {
		console.log(await trpc.app.endIssue.mutate());
	}
</script>

<div class="h-full overflow-y-auto">
<div class="max-w-2xl mx-auto flex flex-col gap-2 p-4">
	<p>Start Known Issue</p>
	<Input type="text" placeholder="Message" bind:value={message} class="mb-2" />
	<Input type="text" placeholder="Effected Events" bind:value={effectedEvents} class="mb-2" />
	<div class="flex gap-2">
		<Button onclick={() => startIssue(message, effectedEvents.split(","))}>Start</Button>
		<Button onclick={endIssue}>End Known Issue</Button>
	</div>
</div>

<div class="grid grid-cols-4 gap-2 mx-auto max-w-5xl">
	<p>Name</p>
	<p>Field State</p>
	<p>Match</p>
	<p>Heartbeat</p>
	{#each events as event}
		<p>{event.code} - {event.name}</p>
		<p>{FieldStates[event.field]}</p>
		<p>{event.level} - {event.match}</p>
		<p>
			<Icon
				icon="mdi:favorite"
				class="w-8 h-full py-2 mx-auto {hearts[event.code] ? 'text-green-600' : 'text-gray-500'}"
			/>
		</p>
		<div class="col-span-2">
			{#each event.clients as client}
				<div class="flex items-center gap-2">
					<p>{client.ip}</p>
					<p>{client.userAgent}</p>
				</div>
			{/each}
		</div>
		<div class="col-span-2">
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
		{#if eventUsers[event.code]?.length}
			<div class="col-span-4 flex flex-wrap gap-1 pb-1 border-b border-neutral-300">
				<span class="text-xs text-gray-500 mr-1">Users:</span>
				{#each eventUsers[event.code] as u}
					<span class="text-xs bg-neutral-100 dark:bg-neutral-700 rounded px-1.5 py-0.5">{u.username} <span class="text-gray-400">({u.role})</span></span>
				{/each}
			</div>
		{/if}
	{/each}
</div>
</div>
