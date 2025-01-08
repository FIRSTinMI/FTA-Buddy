<script lang="ts">
    import { Card } from "flowbite-svelte";
    import type { Note } from "../../../shared/types";
    import { formatTimeShort } from "../../../shared/formatTime";

    export let note: Note;

    let time = note.created_at;
</script>
<Card padding="none" size="none" class="w-full text-black dark:text-white dark:bg-neutral-800">
    <div class="flex flex-col sm:flex-row sm:divide-x divide-gray-500 pt-2 sm:pt-0 sm:gap-4 px-4">
        <div class="flex flex-col sm:my-auto">
            <p>#{note.id}
                <span class="sm">{time}</span>
            </p>
        </div>
        <div class="flex flex-col p-2 grow text-left sm:block">
            <p class="font-bold text-xl">{note.team}</p>
            <p class="font-bold">{note.text}</p>
        </div>
        <div class="flex flex-col sm:pl-4 sm:pr-2 pb-4 sm:pt-4">
            <p class="text-wrap">{note.author.username}</p>
        </div>
    </div>
</Card>
