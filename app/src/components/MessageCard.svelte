<script lang="ts">
    import { Card, Modal, Label, Textarea, Button } from "flowbite-svelte";
    import { EditOutline, TrashBinOutline } from 'flowbite-svelte-icons';
    import type { Message } from "../../../shared/types";
    import { formatTimeNoAgoHourMins } from "../../../shared/formatTime";
    import { trpc } from "../main";
    import { eventStore } from "../stores/event";
    import { userStore } from "../stores/user";
    import { get } from "svelte/store";
    import { navigate } from "svelte-routing";
    import { onMount } from "svelte";
    import { toast } from "../../../shared/toast";



    let event = get(eventStore);
    let user = get(userStore);

    export let message: Message;

    let deleteMessagePopup = false;

    let time = formatTimeNoAgoHourMins(message.created_at);
    let editMessageView = false;
    let editMessageText = message.text;

    async function editMessage() {
        try {
            if (editMessageText !== message.text) {
                const res = await trpc.tickets.messages.edit.query({
                    ticket_id: message.ticket_id,
                    message_id: message.id,
                    new_text: editMessageText,
                });
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
        try{
            const res = await trpc.tickets.messages.delete.query({
                ticket_id: message.ticket_id,
                message_id: message.id,
            });
            toast("Message deleted successfully", "success", "green-500");
            location.reload();
		} catch (err: any) {
			toast("An error occurred while deleting the Message", err.message);
			console.error(err);
			return;
		}
    }
</script>

<Modal bind:open={editMessageView} size="lg" outsideclose dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
    <div slot="header">
        <h1 class="text-2xl font-bold text-black dark:text-white place-content-center">Edit Message</h1>
    </div>
    <form class="text-left flex flex-col gap-4" on:submit|preventDefault={editMessage}>
        <Label for="text">Edit Text:</Label>
        <Textarea id="text" class="w-full" rows="5" bind:value={editMessageText} />
        <Button type="submit">Save Changes</Button>
    </form>
</Modal>

<Modal bind:open={deleteMessagePopup} size="sm" outsideclose dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
	<div class="text-center">
		<h3 class="mb-5 text-lg">Are you sure you want to delete this Message?</h3>
		<Button on:click={deleteMessage} color="red" class="me-2">Yes, I'm sure</Button>
		<Button on:click={() => (deleteMessagePopup = false)}>No, cancel</Button>
	  </div>
</Modal>

<Card padding="none" size="none" class="w-full text-black dark:text-white dark:bg-neutral-800">
    <div class="flex flex-col sm:flex-row max-sm:divide-y sm:divide-x divide-gray-500 pt-2 px-4 min-h-28">
        <div class="flex flex-row justify-between text-left sm:block sm:text-center sm:place-content-center">
            <p class="sm:w-28 text-wrap italic font-bold p-2">{message.author.username} - {message.author.role}</p>
            {#if (user.id === message.author_id)}
                <div>
                    <Button class="pt-2 pb-2 pl-3 pr-2 mb-5" on:click={() => (editMessageView = true)}><EditOutline class="w-5"/></Button>
                    <Button on:click={() => (deleteMessagePopup = true)} class="pt-2 pb-2 pl-3 pr-2 mb-5"><TrashBinOutline class="pr-1"/></Button>
                </div>
            {/if}
        </div>
        <div class="p-4 grow text-left">
            <p class="text-wrap">{message.text}</p>
        </div>
        <div class="text-right sm:text-center sm:place-content-center">
            <p class="sm:w-20 text-wrap italic p-2">{time}</p>
        </div>
    </div>
</Card>
