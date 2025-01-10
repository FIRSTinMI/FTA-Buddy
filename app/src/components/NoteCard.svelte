<script lang="ts">
    import { Card } from "flowbite-svelte";
    import type { Note } from "../../../shared/types";
    import { formatTimeNoAgoHourMins } from "../../../shared/formatTime";

    export let note: Note;

    let time = formatTimeNoAgoHourMins(note.created_at);
</script>
<Card padding="none" size="none" class="w-full text-black dark:text-white dark:bg-neutral-800">
    <div class="flex flex-col sm:flex-row divide-y sm:divide-x divide-gray-500 pt-2 px-4">
        <div class="text-left sm:text-center sm:place-content-center">
            <p class="sm:w-28 text-wrap italic font-bold p-2">{note.author.username} - {note.author.role}</p>
        </div>
        <div class="p-4 grow text-left">
            <p class="font-bold underline underline-offset-2 text-xl">{note.team}</p>
            <p class="text-wrap">{note.text}</p>
        </div>
        <div class="text-right sm:text-center sm:place-content-center">
            <p class="sm:w-20 text-wrap italic p-2">{time}</p>
        </div>
    </div>
</Card>
