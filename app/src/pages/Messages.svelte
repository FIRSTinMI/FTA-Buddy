<script lang="ts">
    import { Button, Card, Label, Select } from "flowbite-svelte";
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import { default as MessageComponent } from "../components/Message.svelte";
    import { trpc } from "../main";
    import { eventStore, type Event } from "../stores/event";
    import { messagesStore, type Message } from "../stores/messages";
    import { formatTimeShort } from "../util/formatTime";
    import TicketCard from "../components/TicketCard.svelte";

    export const newMessage = (message: any) => {
        console.log(message);
    };

    let data = get(messagesStore);
    let teams: Event["teams"] = get(eventStore).teams || [];

    let teamOptions = teams.sort((a, b) => parseInt(a.number) - parseInt(b.number)).map((v) => ({ value: v.number, name: `${v.number} - ${v.name}` }));

    export let team: string | undefined;
    let view: "tickets" | "team" = team ? "team" : "tickets";

    let scrollBox: HTMLDivElement;
    let messages: Message[] = [];
    let tickets: Awaited<ReturnType<typeof trpc.messages.getTickets.query>> = [];
    let ticketsPromise: Promise<any> | undefined;

    async function getTickets() {
        ticketsPromise = trpc.messages.getTickets.query({});
        tickets = await ticketsPromise;
    }

    onMount(() => {
        getTickets();
    });

    function selectTeam(evt: Event) {
        if (!team) return;
        messages = data.messages[team];
    }
</script>

<div class="container max-w-6xl mx-auto px-2 pt-2 h-full flex flex-col gap-2">
    <div class="grid grid-cols-2 gap-2">
        {#if view == "tickets"}
            <Button>Tickets</Button>
        {:else}
            <Button
                outline
                on:click={() => {
                    view = "tickets";
                }}>Tickets</Button
            >
        {/if}
        {#if view == "team"}
            <Button>Team</Button>
        {:else}
            <Button
                outline
                on:click={() => {
                    view = "team";
                }}>Team</Button
            >
        {/if}
    </div>

    {#if view == "team"}
        <form class="flex">
            <Label class="w-full text-left">
                Select Team
                <Select class="mt-2" items={teamOptions} bind:value={team} on:change={() => selectTeam} />
            </Label>
        </form>
    {:else}
        <div>
            <Button class="w-full" href="/app/ticket">Create New Ticket</Button>
        </div>
    {/if}

    <div class="overflow-y-auto h-full" bind:this={scrollBox}>
        <div class="flex flex-col justify-end">
            {#if view == "team" && team}
                {#if !messages || messages.length < 1}
                    <div class="text-center">No messages</div>
                {:else}
                    {#each messages as message}
                        <MessageComponent {message} {team} />
                    {/each}
                {/if}
            {:else if view == "tickets"}
                {#if !tickets || tickets.length < 1}
                    <div class="text-center">No tickets</div>
                {:else}
                    {#each tickets as ticket}
                        <TicketCard {ticket} />
                    {/each}
                {/if}
            {/if}
        </div>
    </div>
</div>
