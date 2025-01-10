<script lang="ts">
    import { Card } from "flowbite-svelte";
    import type { Message } from "../../../shared/types";
    import { formatTimeNoAgoHourMins } from "../../../shared/formatTime";

    export let message: Message;

    let time = formatTimeNoAgoHourMins(message.created_at);
</script>
<Card padding="none" size="none" class="w-full text-black dark:text-white dark:bg-neutral-800">
    <div class="flex flex-col sm:flex-row divide-y sm:divide-x divide-gray-500 pt-2 px-4">
        <div class="text-left sm:text-center sm:place-content-center">
            <p class="sm:w-28 text-wrap italic font-bold p-2">{message.author.username} - {message.author.role}</p>
        </div>
        <div class="p-4 grow text-left">
            <p class="text-wrap">{message.text}</p>
        </div>
        <div class="text-right sm:text-center sm:place-content-center">
            <p class="sm:w-20 text-wrap italic p-2">{time}</p>
        </div>
    </div>
</Card>
