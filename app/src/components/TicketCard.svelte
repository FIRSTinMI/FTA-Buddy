<script lang="ts">
    import { Card } from "flowbite-svelte";
    import type { Ticket } from "../../../shared/types";
    import { formatTimeShort } from "../../../shared/formatTime";

    export let ticket: Ticket;

    let time = formatTimeShort(((ticket.closed_at && !ticket.is_open) ? ticket.closed_at : ticket.created_at));

    setInterval(() => {
        time = formatTimeShort(((ticket.closed_at && !ticket.is_open) ? ticket.closed_at : ticket.created_at));
    }, (time.includes("s ") ? 1000 : 60000));

</script>
<Card href="/app/ticket/{ticket.id}" padding="none" size="none" class="w-full text-black dark:text-white dark:bg-neutral-800">
    <div class="flex flex-col sm:flex-row sm:divide-x divide-gray-500 pt-2 sm:pt-0 sm:gap-4 px-4">
        <div class="flex flex-col sm:my-auto">
            <p>#{ticket.id}
                {#if ticket.is_open}
                    <span class="text-green-500 dark:text-green-500 font-bold">Open</span>
                {:else}
                    <span class="font-bold">Closed</span>
                {/if}
                <span class="sm:hidden">{time}</span>
            </p>
            {#if ticket.team}
                <p class="sm:text-lg">Team: {ticket.team}</p>
            {/if}
            <p class="hidden sm:block">{formatTimeShort((!ticket.is_open && ticket.closed_at) ? ticket.closed_at : ticket.created_at)}</p>
        </div>
        <div class="flex flex-col p-2 grow text-left sm:block">
            <p class="font-bold">{ticket.subject}</p>
        </div>
        <div class="flex flex-col sm:pl-4 sm:pr-2 pb-4 sm:pt-4">
            {#if ticket.assigned_to_id === -1}
                <p>Unassigned</p>
            {:else}
                <p class="text-wrap">Assigned to: {ticket.assigned_to?.username}</p>
            {/if}
        </div>
    </div>
</Card>
