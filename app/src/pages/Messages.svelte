<script lang="ts">
    import Icon from "@iconify/svelte";
    import { Alert, Button, Label, Select, Textarea, ToolbarButton } from "flowbite-svelte";
    import { get } from "svelte/store";
    import { eventStore, type Event } from "../stores/event";
    import { messagesStore, type Message, type Ticket } from "../stores/messages";
    import MessageComponent from "../components/Message.svelte";

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
    let tickets: Ticket[] = [];

    function selectTeam(evt: Event) {
        if (!team) return;
        messages = data.messages[team];
    }
</script>

<div class="container mx-auto px-2 pt-2 h-full flex flex-col gap-2">
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
            <Button class="w-full">Create New Ticket</Button>
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
            {:else if !tickets || tickets.length < 1}
                <div class="text-center">No tickets</div>
            {:else}
                {#each tickets as ticket}
                    <div class="flex justify-between">
                        <div>{ticket.team}</div>
                        <div>{ticket.message}</div>
                    </div>
                {/each}
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
