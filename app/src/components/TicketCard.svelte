<svelte:head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</svelte:head>
<script lang="ts">
    import { Card, Button } from "flowbite-svelte";
    import type { Ticket } from "../../../shared/types";
    import { formatTimeNoAgoHourMins } from "../../../shared/formatTime";
    import { navigate } from "svelte-routing";

    export let ticket: Ticket;

    let time = formatTimeNoAgoHourMins(((ticket.closed_at && !ticket.is_open) ? ticket.closed_at : ticket.created_at));

    setInterval(() => {
        time = formatTimeNoAgoHourMins(((ticket.closed_at && !ticket.is_open) ? ticket.closed_at : ticket.created_at));
    }, (time.includes("s ") ? 1000 : 60000));

</script>
<Card href="ticket/{ticket.id}" padding="none" size="none" class="w-full text-black dark:text-white dark:bg-neutral-800">
    <div class="flex flex-col sm:flex-row divide-y sm:divide-x divide-gray-500 pt-2 px-4 min-h-24">
        <div class="flex flex-row sm:flex-col place-content-between sm:place-content-center p-2 sm:w-40">
            <p class="font-bold sm:text-center">#{ticket.id}:
                {#if ticket.is_open}
                    <span class="text-green-500 dark:text-green-500 font-bold text-left sm:text-center"> Open</span>
                {:else}
                    <span class="font-bold sm:text-center"> Closed</span>
                {/if}
            </p>
            {#if ticket.team}
                <p class="text-right sm:text-center"><b>Team:</b> {ticket.team}</p>
            {/if}
        </div>
        <div class="p-2 grow place-content-center">
            <p class="font-bold text-lg">{ticket.subject}</p>
        </div>
        <div class="flex flex-row sm:flex-col pb-4 place-content-between sm:place-content-center sm:w-40 p-2">
            <p class="text-left sm:text-center">{time}</p>
            {#if ticket.assigned_to_id === null}
                <p class="text-wrap font-bold text-right sm:text-center">Unassigned</p>
            {:else}
                <p class="text-wrap font-bold text-right sm:text-center">Assigned to: {ticket.assigned_to?.username}</p>
            {/if}
        </div>
    </div>
</Card>
