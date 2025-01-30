<script lang="ts">
    import { Card, Modal, Label, Textarea, Button } from "flowbite-svelte";
    import { EditOutline, TrashBinOutline } from 'flowbite-svelte-icons';
    import type { Message, Note } from "../../../shared/types";
    import { formatTimeNoAgoHourMins } from "../../../shared/formatTime";
    import { trpc } from "../main";
    import { eventStore } from "../stores/event";
    import { userStore } from "../stores/user";
    import { get } from "svelte/store";
    import { navigate } from "svelte-routing";
    import { toast } from "../../../shared/toast";


    let event = get(eventStore);
    let user = get(userStore);

    export let note: Note;

    let deleteNotePopup = false;

    let time = formatTimeNoAgoHourMins(note.created_at);
    let editNoteView = false;
    let editNoteText = note.text;

    async function editNote() {
        try {
            if (editNoteText !== note.text) {
                const res = await trpc.notes.edit.query({
                    id: note.id,
                    new_text: editNoteText,
                    event_code: event.code,
                });
                toast("Message Edited successfully", "success", "green-500");
                location.reload();
            } else {
                toast("Cannot Edit Message without Text", "red-500");
            }
        } catch (err: any) {
            toast("An error occurred while editing the Ticket", err.message);
            console.error(err);
            return;
        } 
    }

    async function deleteNote() {
        try{
            const res = await trpc.notes.delete.query({
                id: note.id,
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

<Modal bind:open={editNoteView} size="lg" outsideclose dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
    <div slot="header">
        <h1 class="text-2xl font-bold text-black dark:text-white place-content-center">Edit Note</h1>
    </div>
    <form class="text-left flex flex-col gap-4" on:submit={editNote}>
        <Label for="text">Edit Text:</Label>
        <Textarea id="text" class="w-full" rows="5" bind:value={editNoteText} />
        <Button type="submit">Save Changes</Button>
    </form>
</Modal>

<Modal bind:open={deleteNotePopup} size="sm" outsideclose dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
	<div class="text-center">
		<h3 class="mb-5 text-lg">Are you sure you want to delete this Note?</h3>
		<Button on:click={deleteNote} color="red" class="me-2">Yes, I'm sure</Button>
		<Button on:click={() => (deleteNotePopup = false)}>No, cancel</Button>
	  </div>
</Modal>

<Card padding="none" size="none" class="w-full text-black dark:text-white dark:bg-neutral-800">
    <div class="flex flex-col sm:flex-row max-sm:divide-y sm:divide-x  pt-2 px-4">
        <div class="flex flex-row justify-between text-left sm:block sm:text-center sm:place-content-center">
            <p class="sm:w-28 text-wrap italic font-bold mt-4 p-2">{note.author.username} - {note.author.role}</p>
            {#if (user.id === note.author_id)}
                <div class="mt-4">
                    <Button class="pt-2 pb-2 pl-3 pr-2 mb-5" on:click={() => (editNoteView = true)}><EditOutline class="w-5"/></Button>
                    <Button on:click={() => (deleteNotePopup = true)} class="pt-2 pb-2 pl-3 pr-2 mb-5"><TrashBinOutline class="pr-1"/></Button>
                </div>
            {/if}
        </div>
        <div class="p-4 grow text-left">
            <p class="font-bold text-xl">Team #: {note.team}</p>
            <p class="text-wrap">{note.text}</p>
        </div>
        <div class="flex flex-row sm:place-content-center sm:flex-col justify-between sm:w-min">
            <p class="text-wrap italic font-bold mb-2 p-2">{note.event_code}</p>
            <p class="text-wrap italic mb-2 p-2">{time}</p>
        </div>
        
    </div>
</Card>
