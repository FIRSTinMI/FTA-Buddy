<script lang="ts">
    import { Card } from "flowbite-svelte";
    import type { Ticket } from "../../../shared/types";
    import { formatTimeShort } from "../util/formatTime";
    import { default as MessageComponent } from "./Message.svelte";

    export let ticket: Ticket;

</script>
<Card href="/app/ticket/{ticket.id}" padding="none" size="none" class="w-full">
    <div class="flex flex-col sm:flex-row sm:divide-x divide-gray-500 pt-2 sm:pt-0 sm:gap-4 px-4">
        <div class="flex flex-col sm:my-auto">
            <p>#{ticket.id} - 
                {#if ticket.is_open}
                    <span class="text-green-500 font-bold">Open</span>
                    <span class="sm:hidden">{formatTimeShort(ticket.created_at)}</span>
                {:else}
                    <span class="font-bold">Closed</span>
                    <span class="sm:hidden">{formatTimeShort(ticket.closed_at ?? ticket.created_at)}</span>
                {/if}
            </p>
            <p class="sm:text-lg">Team: {ticket.team} - {ticket.teamName}</p>
            <p class="hidden sm:block">{formatTimeShort((!ticket.is_open && ticket.closed_at) ? ticket.closed_at : ticket.created_at)}</p>
        </div>
        <div class="flex flex-col p-2 grow text-left">
            {#if ticket.message.length > 255}
                <p class="font-bold">{ticket.message.slice(0, 255)}...</p>
            {:else}
                <p class="font-bold">{ticket.message}</p>
            {/if}
            <MessageComponent message={ticket.messages[0] ?? ticket} team={ticket.team} class="w-full self-start text-left" />
        </div>
    </div>
</Card>
