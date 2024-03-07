<script lang="ts">
    import Icon from "@iconify/svelte";
    import { Button, Indicator } from "flowbite-svelte";
    import { Router, Route, Link } from "svelte-routing";
    import Home from "./pages/Home.svelte";
    import Notes from "./pages/Notes.svelte";
    import Flashcard from "./pages/Flashcards.svelte";
    import Reference from "./pages/Reference.svelte";
    import { get } from "svelte/store";
    import type { MonitorFrame } from "../../shared/types";
    import { eventStore } from "./stores/event";
    import { notesStore } from "./stores/notes";
    import { onMount } from "svelte";
    import { settingsStore } from "./stores/settings";
    import { authStore } from "./stores/auth";

    export let toast: (title: string, text: string) => void;
    export let openSettings: () => void;
    export let updateDevStats: (lastFrameTime: Date, frameCount: number, lastMessageTime: Date, messageCount: number, reconnects: number) => void;

    let lastFrameTime: Date;
    let frameCount = 0;
    let lastMessageTime: Date;
    let messageCount = 0;
    let reconnects = -1;

    $: updateDevStats(lastFrameTime, frameCount, lastMessageTime, messageCount, reconnects);

    let ws: WebSocket;
    let monitorFrame: MonitorFrame;

    let notifications = get(notesStore).unread || 0;
    notesStore.subscribe((value) => {
        notifications = value.unread;
    });

    let settings = get(settingsStore);
    settingsStore.subscribe((value) => {
        settings = value;
    });

    let timeoutID: NodeJS.Timeout;

    let notesChild: Notes;

    function openWebSocket() {
        const uri = `${window.location.protocol.endsWith("s:") ? "wss" : "ws"}://${window.location.host}/ws/`;

        console.log("Connecting to " + uri);

        reconnects++;
        if (ws) ws.close();
        ws = new WebSocket(uri);
        ws.onopen = function () {
            console.log("Connected to " + uri);
            this.send("client-" + get(authStore).eventToken);
            setInterval(() => ws.send("ping"), 60e3);
        };

        ws.onmessage = function (evt) {
            try {
                let data = JSON.parse(evt.data);
                if (data.type === "monitorUpdate") {
                    lastFrameTime = new Date();
                    frameCount++;
                    monitorFrame = data;
                } else if (data.type === "message") {
                    notifications++;
                    notesStore.update((s) => {
                        s.unread = notifications;
                        return s;
                    });
                    lastMessageTime = new Date();
                    messageCount++;
                    if (notesChild) notesChild.newMessage(data);
                }
            } catch (e) {
                console.error(e);
            }
        };

        ws.onclose = function (evt) {
            if (!evt.wasClean) {
                console.log(evt);
                console.log("Webscocket disconnected from reconnecting in 5 sec");
                timeoutID = setTimeout(() => openWebSocket(), 5e3);
            } else {
                console.log("Disconnected cleanly");
            }
        };
    }

    document.addEventListener("visibilitychange", (evt) => {
        if (document.visibilityState === "visible") {
            console.log("Returning from inactive");
            console.log(ws.readyState == 1 ? "Connected" : "Disconnected");
            if (!ws || ws.readyState !== 1) {
                if (timeoutID) clearTimeout(timeoutID);
                openWebSocket();
            }
        }
    });

    onMount(() => {
        openWebSocket();
    });
</script>

<Router basepath="/">
    <div class="overflow-y-auto flex-grow pb-2">
        <Route path="/">
            <Home bind:monitorFrame />
        </Route>
        <Route path="/flashcards" component={Flashcard} />
        <Route path="/references" component={Reference} />
        <Route path="/notes">
            <Notes bind:this={notesChild} team={undefined} bind:notifications />
        </Route>
        <Route path="/notes/:team" component={Notes} />
    </div>

    <div class="flex justify-around py-2 bg-neutral-700">
        <Link to="/">
            <Button class="!p-2" color="none">
                <Icon icon="mdi:television" class="w-8 h-8" />
            </Button>
        </Link>
        <Link to="/flashcards">
            <Button class="!p-2" color="none">
                <Icon icon="mdi:message-alert" class="w-8 h-8" />
            </Button>
        </Link>
        <Link to="/references">
            <Button class="!p-2" color="none">
                <Icon icon="mdi:file-document-outline" class="w-8 h-8" />
            </Button>
        </Link>
        <Link to="/notes">
            <Button class="!p-2 relative" color="none">
                <Icon icon="mdi:message-text" class="w-8 h-8" />
                {#if notifications > 0}
                    <Indicator color="red" border size="xl" placement="top-left">
                        <span class="text-white text-xs">{notifications}</span>
                    </Indicator>
                {/if}
            </Button>
        </Link>
    </div>
</Router>
