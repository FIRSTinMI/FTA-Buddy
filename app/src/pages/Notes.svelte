<script lang="ts">
    import { notesStore } from "./../stores/notes";
    import { Alert, Textarea, ToolbarButton, Label, Select, type SelectOptionType, Button } from "flowbite-svelte";
    import { eventStore } from "../stores/event";
    import { get } from "svelte/store";
    import Message from "../components/Message.svelte";
    import { userStore } from "../stores/user";
    import Icon from "@iconify/svelte";
    import { sortTeams } from "../util/sortTeams";

    let element: HTMLElement;

    export const newMessage = (message: any) => {
        console.log(message);
        if (message.team === team) {
            messages = [...messages, message.message];
        }
        notesStoreData.notes[team] = messages;
        notesStore.set(notesStoreData);
        setTimeout(() => scrollToBottom(element), 100);
    };

    let event = get(eventStore);
    let notesStoreData = get(notesStore);
    let user = get(userStore);

    export let notifications: number;
    export let openLogin: () => void;

    export let team: string;
    if (team == undefined || team == "") {
        team = notesStoreData?.lastTeam || notesStoreData?.teams[0] || "";
    }

    let messages = notesStoreData?.notes[team] || [];

    let teams: SelectOptionType<string>[] = sortTeams(notesStoreData?.teams || []).map((team: string) => ({
        name: team,
        value: team,
    }));
    updateTeams();

    async function updateTeams() {
        if (!event) return;
        let teamsData = await fetch("https://ftabuddy.com/teams/" + encodeURIComponent(event)).then((res) =>
            res.json(),
        );
        teamsData = sortTeams(teamsData);

        teams = [
            {
                name: "Feed",
                value: "feed",
            },
            ...teamsData.map((team: string) => ({
                name: team.toString(),
                value: team.toString(),
            })),
        ];
        notesStoreData.teams = teamsData.map((team: string) => team.toString());
        notesStore.set(notesStoreData);
        console.log(teams);
    }

    function selectTeam(evt: Event) {
        team = (evt.target as HTMLSelectElement).selectedOptions[0].value;
        notesStoreData.lastTeam = team;
        notesStore.set(notesStoreData);
    }

    async function getMessages(team: string) {
        if (!team) return;
        if (team == "feed") {
            // Get feed
            messages = await fetch("https://ftabuddy.com/message/feed/" + encodeURIComponent(event)).then((res) =>
                res.json(),
            );

            setTimeout(() => scrollToBottom(element), 100);
        } else {
            messages = await fetch("https://ftabuddy.com/message/" + encodeURIComponent(team)).then((res) =>
                res.json(),
            );

            messages = messages.map((message: any) => ({
                ...message,
                created: new Date(message.created),
            }));

            notesStoreData.notes[team] = messages;

            console.log(messages);
            setTimeout(() => scrollToBottom(element), 100);
            return messages;
        }
    }

    async function sendMessage(evt: Event) {
        evt.preventDefault();
        const message = (document.getElementById("chat") as HTMLTextAreaElement).value;
        if (message.trim().length > 0) {
            const body = {
                profile: user.id,
                token: user.token,
                event: get(eventStore),
                message: message.trim(),
            };
            console.log(body);
            if (team == "feed") {
                const response = await fetch("https://ftabuddy.com/message/feed/" + encodeURIComponent(event), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(body),
                });

                if (response.ok) {
                    (document.getElementById("chat") as HTMLTextAreaElement).value = "";
                    getMessages(team);
                }
                return;
            } else {
                const response = await fetch("https://ftabuddy.com/message/" + encodeURIComponent(team), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(body),
                });

                if (response.ok) {
                    (document.getElementById("chat") as HTMLTextAreaElement).value = "";
                    getMessages(team);
                }
            }
        }
    }

    function sendKey(evt: KeyboardEvent) {
        if (evt.key === "Enter" && !evt.shiftKey) {
            sendMessage(new Event("submit"));
        }
    }

    $: {
        getMessages(team);
    }

    function scrollToBottom(node: HTMLElement) {
        console.log(node.scrollHeight);
        if (node) node.scroll({ top: node.scrollHeight, behavior: "instant" });
    }

    userStore.subscribe((value) => {
        user = value;
    });

    notesStore.subscribe((value) => {
        if (value.unread > 0) {
            notesStore.update((n) => {
                n.unread = 0;
                return n;
            });
        }
    });

    notesStore.update((n) => {
        n.unread = 0;
        return n;
    });
</script>

<div class="container mx-auto px-2 pt-2 h-full flex flex-col">
    <Button
        on:click={() => {
            team = "feed";
        }}>Feed</Button
    >
    <form class="flex">
        <Label class="w-full text-left">
            Select Team
            <Select class="mt-2" items={teams} bind:value={team} on:change={selectTeam} />
        </Label>
    </form>
    <div class="overflow-y-auto h-full" bind:this={element}>
        <div class="flex flex-col justify-end">
            {#if !messages || messages.length < 1}
                <div class="text-center">No messages</div>
            {:else}
                {#each messages as message}
                    <Message {message} {team} />
                {/each}
            {/if}
        </div>
    </div>
    {#if user && user.id > 0}
        <form on:submit={sendMessage}>
            <label for="chat" class="sr-only">Your message</label>
            <Alert color="dark" class="px-0 py-2">
                <svelte:fragment slot="icon">
                    <Textarea id="chat" class="ml-3" rows="1" placeholder="Your message..." on:keydown={sendKey} />
                    <ToolbarButton
                        type="submit"
                        color="blue"
                        class="rounded-full text-primary-600 dark:text-primary-500"
                    >
                        <Icon icon="mdi:send" class="w-6 h-8" />
                        <span class="sr-only">Send message</span>
                    </ToolbarButton>
                </svelte:fragment>
            </Alert>
        </form>
    {:else}
        <Button on:click={openLogin}>Log in to send messages</Button>
    {/if}
</div>
