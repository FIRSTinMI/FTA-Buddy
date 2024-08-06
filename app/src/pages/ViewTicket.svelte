<script lang="ts">
    import { get } from "svelte/store";
    import Spinner from "../components/Spinner.svelte";
    import { trpc } from "../main";
    import { formatTime } from "../util/formatTime";
    import { toast } from "../util/toast";
    import { eventStore } from "../stores/event";
    import { ROBOT } from "../../../shared/types";
    import { Alert, Button, Textarea, ToolbarButton } from "flowbite-svelte";
    import { navigate } from "svelte-routing";
    import { authStore } from "../stores/auth";
    import Icon from "@iconify/svelte";
    import Message from "../components/Message.svelte";
	import { onDestroy, onMount, tick } from "svelte";
	import { startBackgroundSubscription, stopBackgroundSubscription } from "../util/notifications";

    export let id: string;

    let promise = trpc.messages.getTicket.query({ id: parseInt(id) });
    let ticket: Awaited<ReturnType<typeof trpc.messages.getTicket.query>> | undefined = undefined;
    let time: string = "";
    let station: ROBOT | undefined = undefined;
    let user = get(authStore).user;
    let assignedToUser = false;

    let subscription: ReturnType<typeof trpc.messages.ticketSubscription.subscribe> | undefined;

    $: if (ticket && user) {
        assignedToUser = ticket.assigned_to.map(u => u?.id).includes(user.id);
    }

    promise.then(async (res) => {
        res.messages = res.messages.reverse();
        ticket = res;
        time = formatTime(ticket?.created_at);
        if (ticket.match) {
            switch(ticket.team) {
                case ticket.match.stations.red1:
                    station = ROBOT.red1;
                    break;
                case ticket.match.stations.red2:
                    station = ROBOT.red2;
                    break;
                case ticket.match.stations.red3:
                    station = ROBOT.red3;
                    break;
                case ticket.match.stations.blue1:
                    station = ROBOT.blue1;
                    break;
                case ticket.match.stations.blue2:
                    station = ROBOT.blue2;
                    break;
                case ticket.match.stations.blue3:
                    station = ROBOT.blue3;
                    break;
            }
        }

        await tick();
        scrollToBottom();
    }).catch((err) => {
        console.error(err);
        toast("An error occurred while fetching the ticket", err.message);
    });
    
    setInterval(() => {
        if (!ticket) return;
        time = formatTime(ticket?.created_at);
    }, (time.includes("s ") ? 1000 : 60000));

    async function closeOpenTicket() {
        if (!ticket) return;
        try {
            const update = await trpc.messages.updateTicketStatus.query({ id: ticket.id, status: !ticket.is_open });
            ticket.is_open = update.is_open;
        } catch (err: any) {
            toast("An error occurred while updating the ticket", err.message);
            console.error(err);
            return;
        }
    }

    async function assignSelf() {
        if (!ticket) return;
        try {
            const update = await trpc.messages.assignTicket.query({ id: ticket.id, user: user?.id ?? 0, assign: !assignedToUser });
            ticket.assigned_to = update;
        } catch (err: any) {
            toast("An error occurred while updating the ticket", err.message);
            console.error(err);
            return;
        }
    }

    function viewLog() {
        if (!ticket || !ticket.match || !station) return;
        navigate(`/app/logs/${ticket.match.id}/${station}`);
    }

    
    function back() {
        if (window.history.state === null) {
            navigate("/app/messages")
        } else {
            window.history.back();
        }
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
        
        if (message.trim().length < 1) {
            toast("Error Sending Message", "Message cannot be empty");
        };

        if (!ticket || !user) return;

        await trpc.messages.addMessage.query({
            message: message.trim(),
            team: ticket.team,
            ticketId: ticket.id,
            eventToken: get(authStore).eventToken,
        });

        console.log({
            id: 0,
            message: message.trim(),
            team: ticket.team.toString(),
            user: user,
            user_id: user.id,
            event_code: get(eventStore).code,
            created_at: new Date(),
        });

        ticket.messages.push({
            id: 0,
            message: message.trim(),
            team: ticket.team.toString(),
            user: user,
            user_id: user.id,
            event_code: get(eventStore).code,
            created_at: new Date(),
        });

        message = "";

        ticket = {...ticket};
        await tick();
        scrollToBottom();
    }

    function scrollToBottom() {
        const chat = document.getElementById("chat");
        if (chat) {
            chat.scrollTo(0, chat.scrollHeight);
        }
    }

    onMount(() => {
        stopBackgroundSubscription();
        if (subscription) subscription.unsubscribe();
        if (ticket) {
            subscription = trpc.messages.ticketSubscription.subscribe({ id: ticket.id, eventToken: $authStore.eventToken }, {
                onData: (data) => {
                    console.log(data);
                    if (!ticket) return;
                    if (data.data.is_ticket) {
                        if (data.data.id !== ticket.id) return;
                    } else {
                        if (data.data.thread_id !== ticket.id) return;
                    }

                    if (data.type === "status") {
                        ticket.is_open = data.data.is_open;
                    } else if (data.type === "assign" && data.data.is_ticket) {
                        ticket.assigned_to = data.data.assigned_to;
                    } else if (data.type === "ticketReply" && !data.data.is_ticket) {
                        ticket.messages.push(data.data);
                    }
                },
            });
        }
    });

    onDestroy(() => {
        startBackgroundSubscription();
    });
</script>

<div class="container mx-auto px-2 pt-2 h-full flex flex-col gap-2 max-w-5xl">
    <Button on:click={back} class="w-fit">Back</Button>
    {#await promise}
        <Spinner />
    {:then}
        {#if ticket === undefined}
            <p class="text-red-500">Ticket not found</p>
        {:else}
            <h1 class="text-2xl font-bold">Ticket #{id} - 
                {#if ticket.is_open}
                    <span class="text-green-500 font-bold">Open</span>
                {:else}
                    <span class="font-bold">Closed</span>
                {/if}
            </h1>
            <div class="text-left">
                <p class="text-lg">Team: {ticket.team} - {get(eventStore).teams.find((t) => t.number == ticket?.team)?.name}</p>
                <p class="text-lg">Created: {time}</p>
                <p class="text-lg">Assigned To: 
                    {#if ticket.assigned_to && ticket.assigned_to.length > 0}
                        {ticket.assigned_to.map(p => p?.username).join(", ")}
                    {:else}
                        Unassigned
                    {/if}
                </p>
                {#if ticket.match}
                    <p class="text-lg">
                        Match: {ticket.match.level.replace('None', 'Test')} 
                        {ticket.match.match_number}/{ticket.match.play_number} 
                        {station}
                    </p>
                {/if}
            </div>
            <div class="flex gap-2">
                <Button size="sm" on:click={() => closeOpenTicket()}>{ticket.is_open ? "Close Ticket":"Reopen Ticket"}</Button>
                {#if user}
                    <Button size="sm" on:click={() => assignSelf()}>
                        {assignedToUser ? "Unassign":"👀 Claim Ticket"}
                    </Button>
                {/if}
                {#if ticket.match}
                    <Button size="sm" on:click={() => viewLog()}>View Log</Button>
                {/if}
            </div>
            <div class="flex flex-col overflow-y-auto h-full" id="chat">
                <div class="flex flex-col grow gap-2 justify-end">
                    {#if ticket.messages.length < 1}
                        <div class="text-center">No messages</div>
                    {/if}
                    {#each ticket.messages as message}
                        <Message message={message} team={ticket.team} />
                    {/each}
                </div>
            </div>
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
    {/await}
</div>