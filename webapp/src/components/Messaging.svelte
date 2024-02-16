<script lang="ts">
    import { get } from "svelte/store";
    import { notesStore } from "./../stores/notes";
    import { Spinner } from "flowbite-svelte";
    import Message from "./Message.svelte";

    export let team: string;
    let notesStoreData = get(notesStore);
    let username = notesStoreData.username;
    let messages = [];

    async function getMessages() {
        messages = await fetch("https://ftabuddy.com/message/" + encodeURIComponent(team)).then((res) => res.json());

        messages = messages.map((message: any) => ({
            ...message,
            created: new Date(message.created),
        }));

        console.log(messages);
        return messages;
    }
</script>

<div class="flex-grow flex flex-col">
    {#await getMessages()}
        <Spinner color="primary" />
    {:then messages}
        <div class="flex-grow flex flex-col justify-end">
            {#each messages as message}
                <Message {message} />
            {/each}
        </div>
    {/await}
</div>
