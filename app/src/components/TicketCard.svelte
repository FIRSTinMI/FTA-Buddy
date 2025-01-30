<script lang="ts">
	import { A, Card } from "flowbite-svelte";
	import { formatTimeNoAgoHourMins } from "../../../shared/formatTime";
	import type { Ticket } from "../../../shared/types";
	import MessageCard from "./MessageCard.svelte";
	import { userStore } from "../stores/user";
	import { eventStore } from "../stores/event";

	export let ticket: Ticket;

	let time = formatTimeNoAgoHourMins(ticket.updated_at);

	let interval = setInterval(
		() => {
			time = formatTimeNoAgoHourMins(ticket.updated_at);
		},
		time.includes("s ") || time.includes("ow") ? 1000 : 60000
	);

	$: ((updated) => {
		time = formatTimeNoAgoHourMins(updated);
		clearInterval(interval);
		interval = setInterval(
			() => {
				time = formatTimeNoAgoHourMins(updated);
			},
			time.includes("s ") || time.includes("ow") ? 1000 : 60000
		);
	})(ticket.updated_at);

	$: ticket.messages = ticket.messages?.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
</script>

<Card href="/app/ticket/{ticket.id}" padding="none" size="none" class="w-full text-black dark:text-white dark:bg-neutral-800">
	<div class="flex flex-col sm:grid sm:grid-cols-[.1fr_auto_.1fr] max-sm:divide-y sm:divide-x divide-gray-500 pt-2 px-4 min-h-32 w-full">
		<div class="flex flex-row sm:flex-col place-content-between sm:place-content-center p-2 sm:w-40">
			<p class="font-bold sm:text-center">
				{#if $userStore.meshedEventToken && $eventStore.subEvents}
					{$eventStore.subEvents.find((e) => e.code === ticket.event_code)?.label ?? ticket.event_code}
				{/if}
				#{ticket.id}:
				{#if ticket.is_open}
					<span class="text-green-500 dark:text-green-500 font-bold text-left sm:text-center"> Open</span>
				{:else}
					<span class="font-bold sm:text-center"> Closed</span>
				{/if}
			</p>
			{#if ticket.team}
				<p class="text-right sm:text-center"><b>Team:</b> {ticket.team}</p>
			{/if}
		</div>
		<div class="p-2 place-content-center text-left">
			<p class="font-bold text-lg pl-4 pb-2">{ticket.subject}</p>
			{#if ticket.messages && ticket.messages.length > 0}
				<MessageCard message={ticket.messages[ticket.messages.length - 1]} simple />
			{:else}
				<p class="text-gray-500 dark:text-gray-400 pl-4 max-w-3xl">{ticket.text.slice(0, 300) + (ticket.text.length > 300 ? "..." : "")}</p>
			{/if}
		</div>
		<div class="flex flex-row sm:flex-col pb-4 place-content-between sm:place-content-center sm:w-40 p-2">
			<p class="text-left sm:text-center">{time}</p>
			{#if ticket.assigned_to_id === null}
				<p class="text-wrap font-bold text-right sm:text-center">Unassigned</p>
			{:else}
				<p class="text-wrap font-bold text-right sm:text-center">Assigned to: {ticket.assigned_to?.username}</p>
			{/if}
		</div>
	</div>
</Card>
