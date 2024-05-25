<script lang="ts">
    import { Alert, Button, Label, Select, Textarea, ToolbarButton } from "flowbite-svelte";
    import { onDestroy, onMount } from "svelte";
    import { get } from "svelte/store";
    import { default as MessageComponent } from "../components/Message.svelte";
    import TicketCard from "../components/TicketCard.svelte";
    import { trpc } from "../main";
    import { eventStore, type Event } from "../stores/event";
    import Icon from "@iconify/svelte";
    import { authStore } from "../stores/auth";
    import { toast } from "../util/toast";

    export const newMessage = (message: any) => {
        console.log(message);
    };

    let teams: Event["teams"] = get(eventStore).teams || [];

    let teamOptions = teams.sort((a, b) => parseInt(a.number) - parseInt(b.number)).map((v) => ({ value: parseInt(v.number), name: `${v.number} - ${v.name}` }));

    export let team: number | undefined;
    let view: "tickets" | "team" = team ? "team" : "tickets";

    let messages: Awaited<ReturnType<typeof trpc.messages.getMessagesAndTickets.query>> = [];
    let messagesPromise: Promise<any> | undefined;
    let tickets: Awaited<ReturnType<typeof trpc.messages.getTickets.query>> = [];
    let ticketsPromise: Promise<any> | undefined;

    let foregroundSubscription: ReturnType<typeof trpc.messages.foregroundSubscription.subscribe> | undefined;
    let teamSubscription: ReturnType<typeof trpc.messages.teamSubscription.subscribe> | undefined;

    async function getTickets() {
        ticketsPromise = trpc.messages.getTickets.query({});
        tickets = await ticketsPromise;
    }

    async function getMessages(team: number) {
        console.log(team);
        messagesPromise = trpc.messages.getMessagesAndTickets.query({ team });
        messages = await messagesPromise;
    }

    function foregroundSubscribe() {
        if (foregroundSubscription) foregroundSubscription.unsubscribe();
        foregroundSubscription = trpc.messages.foregroundSubscription.subscribe({
            eventToken: get(authStore).eventToken,
        }, {
            onData: (data) => {
                console.log(data);
                if (data.type === "status" || data.type === "assign") {
                    const matchingTicket = tickets.find((t) => t.id === data.data.id);
                    if (matchingTicket && data.data.is_ticket) {
                        if (data.type === "status") matchingTicket.is_open = data.data.is_open;
                        if (data.type === "assign") matchingTicket.assigned_to = data.data.assigned_to;
                    }
                    tickets = tickets;
                } else if (data.type === "create" || data.type === "ticketReply") {
                    getTickets();
                }
            },
        });
    }

    function teamSubscribe(team: number) {
        if (teamSubscription) teamSubscription.unsubscribe();
        teamSubscription = trpc.messages.teamSubscription.subscribe({ 
            team, 
            eventToken: get(authStore).eventToken
        }, {
            onData: (data) => {
                console.log(data);
                getMessages(team);
            },
        });
    }

    onMount(() => {
        getTickets();
        foregroundSubscribe();
    });

    onDestroy(() => {
        if (foregroundSubscription) foregroundSubscription.unsubscribe();
        if (teamSubscription) teamSubscription.unsubscribe();
    });

    function selectTeam() {
        if (!team) return;
        getMessages(team);
        teamSubscribe(team);
    }

    function sendKey(event: KeyboardEvent) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage(new SubmitEvent("submit"));
        }
    }

    let message: string = "";

    async function sendMessage(evt: SubmitEvent) {
        evt.preventDefault();
        if (!team) return;

        if (message.trim().length < 1) {
            toast("Error Sending Message", "Message cannot be empty");
        };

        await trpc.messages.addMessage.query({
            message: message.trim(),
            team,
            eventToken: get(authStore).eventToken,
        });
    }
</script>

<div class="container max-w-6xl mx-auto px-2 pt-2 h-full flex flex-col gap-2">
    <div class="grid grid-cols-2 gap-2">
        {#if view == "tickets"}
            <Button>Ticket Feed</Button>
        {:else}
            <Button
                outline
                on:click={() => {
                    view = "tickets";
                }}>Ticket Feed</Button
            >
        {/if}
        {#if view == "team"}
            <Button>Team Notes/Ticket</Button>
        {:else}
            <Button
                outline
                on:click={() => {
                    view = "team";
                }}>Team Notes/Ticket</Button
            >
        {/if}
    </div>

    {#if view == "team"}
        <form class="flex">
            <Label class="w-full text-left">
                Select Team
                <Select class="mt-2" items={teamOptions} bind:value={team} on:change={() => selectTeam()} />
            </Label>
        </form>
    {:else}
        <div>
            <Button class="w-full" href="/app/ticket">Create New Ticket</Button>
        </div>
    {/if}

    <div class="flex flex-col overflow-y-auto h-full">
        <div class="flex flex-col grow gap-2">
            {#if view == "team" && team}
                {#if !messages || messages.length < 1}
                    <div class="text-center">No messages</div>
                {:else}
                    {#each messages as message}
                        {#if message.is_ticket}
                            <TicketCard ticket={message} />
                        {:else}
                            <MessageComponent {message} team={parseInt(message.team)} />
                        {/if}
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
    {#if view == "team" && team}
        <form on:submit={sendMessage}>
            <label for="chat" class="sr-only">Your message</label>
            <Alert color="dark" class="px-0 py-2">
                <svelte:fragment slot="icon">
                    <Textarea id="chat" class="ml-3" rows="1" placeholder="Your message..." on:keydown={sendKey} bind:value={message} />
                    <ToolbarButton type="submit" color="blue" class="rounded-full text-primary-600 dark:text-primary-500">
                        <Icon icon="mdi:send" class="w-6 h-8" />
                        <span class="sr-only">Send message</span>
                    </ToolbarButton>
                </svelte:fragment>
            </Alert>
        </form>
    {/if}
</div>
