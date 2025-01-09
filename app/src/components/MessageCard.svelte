<script lang="ts">
    import { Card } from "flowbite-svelte";
    import type { Message } from "../../../shared/types";
    import { formatTimeNoAgoHourMins } from "../../../shared/formatTime";

    export let message: Message;

    let time = formatTimeNoAgoHourMins(message.created_at);
</script>
<Card padding="none" size="none" class="w-full text-black dark:text-white dark:bg-neutral-800">
    <div class="flex flex-col sm:flex-row sm:divide-x items-stretch divide-gray-500 pt-2 sm:pt-0 sm:gap-4 px-4">
        <div class="flex flex-col place-content-center text-center">
            <p class="w-28 text-wrap italic font-bold ">{message.author.username}</p>
        </div>
        <div class="flex flex-col p-2 grow text-left place-content-center">
            <p class="text-wrap">{message.text}</p>
        </div>
        <div class="flex flex-col place-content-center text-center">
            <p class="w-20 text-wrap italic">{time}</p>
        </div>
    </div>
</Card>
