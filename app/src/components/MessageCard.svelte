<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Badge, Button, Label, Modal, Textarea } from "flowbite-svelte";
	import { get } from "svelte/store";
	import { formatTimeNoAgoHourMins } from "../../../shared/formatTime";
	import type { Message } from "../../../shared/types";
	import { trpc } from "../main";
	import { eventStore } from "../stores/event";
	import { userStore } from "../stores/user";
	import { toast } from "../util/toast";

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

	async function editMessage(evt: SubmitEvent) {
		evt.preventDefault();
		try {
			if (editMessageText !== message.text) {
				const res = await trpc.notes.messages.edit.mutate({
					note_id: message.note_id,
					message_id: message.id,
					new_text: editMessageText,
				});
				editMessageView = false;
				toast("Message Edited successfully", "success", "green-500");
			} else {
				toast("Cannot Edit Message without Text", "red-500");
			}
		} catch (err: any) {
			toast("An error occurred while editing the Message", err.message);
			console.error(err);
			return;
		}
	}

	async function deleteMessage() {
		try {
			const res = await trpc.notes.messages.delete.mutate({
				note_id: message.note_id,
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
	<form class="text-left flex flex-col gap-4" onsubmit={editMessage}>
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

<div class="rounded-lg bg-gray-100 dark:bg-neutral-700 px-3 py-2.5 flex flex-col gap-1">
	<div class="flex items-center justify-between gap-2">
		<div class="flex items-center gap-1.5 text-xs">
			<span class="font-semibold text-gray-700 dark:text-gray-200">{message.author.username}</span>
			{#if message.author.username !== message.author.role}
				<span class="text-gray-400 dark:text-gray-500">·</span>
				<span class="text-gray-400 dark:text-gray-500">{message.author.role}</span>
			{/if}
			{#if message.author.source === "FMS"}
				<Badge color="indigo" class="text-[10px] py-0 px-1">FMS</Badge>
			{:else if message.author.source === "Slack"}
				<Badge color="purple" class="text-[10px] py-0 px-1">Slack</Badge>
			{/if}
		</div>
		<div class="flex items-center gap-1 shrink-0">
			<span class="text-xs text-gray-400 dark:text-gray-500">{time}</span>
			{#if user.id === message.author_id && !simple}
				<button
					type="button"
					class="p-0.5 rounded text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
					onclick={() => (editMessageView = true)}
					title="Edit"
				>
					<Icon icon="mdi:pencil" class="size-3.5" />
				</button>
				<button
					type="button"
					class="p-0.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
					onclick={() => (deleteMessagePopup = true)}
					title="Delete"
				>
					<Icon icon="mdi:trash-can-outline" class="size-3.5" />
				</button>
			{/if}
		</div>
	</div>
	<!-- Body -->
	<div class="flex flex-row pr-1">
		<Icon icon="ci:arrow-sub-down-right" class="flex size-4 shrink-0 text-gray-500" />
		<p class="flex text-sm text-black dark:text-white text-wrap leading-relaxed text-left pl-1 pb-1">
			{#if simple}
				{message.text.slice(0, 240) + (message.text.length > 240 ? "…" : "")}
			{:else}
				{message.text}
			{/if}
		</p>
	</div>
</div>
