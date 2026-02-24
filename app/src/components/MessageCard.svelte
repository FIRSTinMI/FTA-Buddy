<script lang="ts">
	import { preventDefault } from "svelte/legacy";

	import Icon from "@iconify/svelte";
	import { Button, Card, Label, Modal, Textarea } from "flowbite-svelte";
	import { get } from "svelte/store";
	import { formatTimeNoAgoHourMins } from "../../../shared/formatTime";
	import { toast } from "../../../shared/toast";
	import type { Message } from "../../../shared/types";
	import { trpc } from "../main";
	import { eventStore } from "../stores/event";
	import { userStore } from "../stores/user";

	let event = get(eventStore);
	let user = get(userStore);

	interface Props {
		message: Message;
		simple?: boolean;
	}

	let { message, simple = false }: Props = $props();

	let deleteMessagePopup = $state(false);

	// svelte-ignore state_referenced_locally
	let time = formatTimeNoAgoHourMins(message.created_at);
	let editMessageView = $state(false);
	// svelte-ignore state_referenced_locally
	let editMessageText = $state(message.text);

	async function editMessage() {
		try {
			if (editMessageText !== message.text) {
				const res = await trpc.tickets.messages.edit.mutate({
					ticket_id: message.ticket_id,
					message_id: message.id,
					new_text: editMessageText,
				});
				editMessageView = false;
				toast("Message Edited successfully", "success", "green-500");
			} else {
				toast("Cannot Edit Message without Text", "red-500");
			}
		} catch (err: any) {
			toast("An error occurred while editing the Ticket", err.message);
			console.error(err);
			return;
		}
	}

	async function deleteMessage() {
		try {
			const res = await trpc.tickets.messages.delete.mutate({
				ticket_id: message.ticket_id,
				message_id: message.id,
			});
			deleteMessagePopup = false;
			toast("Message deleted successfully", "success", "green-500");
		} catch (err: any) {
			toast("An error occurred while deleting the Message", err.message);
			console.error(err);
			return;
		}
	}
</script>

<Modal bind:open={editMessageView} size="lg" outsideclose>
	{#snippet header()}
		<div>
			<h1 class="text-2xl font-bold text-black dark:text-white place-content-center">Edit Message</h1>
		</div>
	{/snippet}
	<form class="text-left flex flex-col gap-4" onsubmit={preventDefault(editMessage)}>
		<Label for="text">Edit Text:</Label>
		<Textarea id="text" class="w-full" rows={5} bind:value={editMessageText} />
		<Button type="submit">Save Changes</Button>
	</form>
</Modal>

<Modal bind:open={deleteMessagePopup} size="sm" outsideclose>
	<div class="text-center">
		<h3 class="mb-5 text-lg">Are you sure you want to delete this Message?</h3>
		<Button onclick={deleteMessage} color="red" class="me-2">Yes, I'm sure</Button>
		<Button onclick={() => (deleteMessagePopup = false)}>No, cancel</Button>
	</div>
</Modal>

<Card class="w-full text-black dark:text-white dark:bg-neutral-800">
	<div
		class="flex flex-col sm:grid sm:grid-cols-[.1fr_auto_.1fr] max-sm:divide-y sm:divide-x divide-gray-500 {simple
			? 'min-h-20 p-1'
			: 'min-h-28 pt-2 px-4'}"
	>
		<div class="flex flex-row justify-between text-left sm:block sm:text-center sm:place-content-center">
			<p class="sm:w-28 text-wrap italic font-bold pt-3">{message.author.username} - {message.author.role}</p>
			{#if user.id === message.author_id && !simple}
				<div>
					<Button class="pt-2 pb-2 pl-3 pr-2 mb-5" onclick={() => (editMessageView = true)}
						><Icon icon="mdi:pencil" class="w-5" /></Button
					>
					<Button onclick={() => (deleteMessagePopup = true)} class="pt-2 pb-2 pl-3 pr-2 mb-5"
						><Icon icon="mdi:trash-can-outline" class="pr-1" /></Button
					>
				</div>
			{/if}
		</div>
		<div class="{simple ? 'px-4 py-1' : 'p-4'} grow text-left">
			<p class="text-wrap">
				{#if simple}
					{message.text.slice(0, 240) + (message.text.length > 240 ? "..." : "")}
				{:else}
					{message.text}
				{/if}
			</p>
		</div>
		{#if !simple}
			<div class="text-right sm:text-center sm:place-content-center">
				<p class="sm:w-20 text-wrap italic p-2">{time}</p>
			</div>
		{/if}
	</div>
</Card>
