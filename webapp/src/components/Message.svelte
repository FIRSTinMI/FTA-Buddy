<script lang="ts">
    import { get } from "svelte/store";
    import { formatTime } from "../util/formatTime";
    import { notesStore } from "../stores/notes";

    interface Message {
        created: Date;
        event: string;
        id: number;
        message: string;
        profile: number;
        team: number;
        username: string;
    }

    export let message: Message
    let { username } = get(notesStore);
</script>
<div class="{(username === message.username) ? 'dark:bg-accent text-right self-end' : 'dark:bg-gray-800 text-left'} rounded-xl py-2 px-4 my-3 w-fit">
    <span class="text-sm">
        <span class="font-bold">{message.username}</span> - {message.event} {formatTime(message.created)}
    </span>
    <p>{message.message}</p>
</div>