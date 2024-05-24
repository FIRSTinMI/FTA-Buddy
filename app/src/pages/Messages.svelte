<script lang="ts">
    import { Button, Card, Label, Select } from "flowbite-svelte";
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import { default as MessageComponent } from "../components/Message.svelte";
    import { trpc } from "../main";
    import { eventStore, type Event } from "../stores/event";
    import { messagesStore, type Message } from "../stores/messages";
    import { formatTimeShort } from "../util/formatTime";

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
                    {/each}
                {/if}
            {/if}
        </div>
    </div>
    <!-- <form on:submit={sendMessage}>
        <label for="chat" class="sr-only">Your message</label>
        <Alert color="dark" class="px-0 py-2">
            <svelte:fragment slot="icon">
                <Textarea id="chat" class="ml-3" rows="1" placeholder="Your message..." on:keydown={sendKey} />
                <ToolbarButton type="submit" color="blue" class="rounded-full text-primary-600 dark:text-primary-500">
                    <Icon icon="mdi:send" class="w-6 h-8" />
                    <span class="sr-only">Send message</span>
                </ToolbarButton>
            </svelte:fragment>
        </Alert>
    </form> -->
</div>
