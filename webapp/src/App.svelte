<script lang="ts">
    import { Router, Route, Link } from "svelte-routing";
    import Home from "./pages/Home.svelte";
    import Flashcard from "./pages/Flashcards.svelte";
    import { Button } from "flowbite-svelte";
    import Icon from "@iconify/svelte";
    import Reference from "./pages/Reference.svelte";
    import Notes from "./pages/Notes.svelte";
    import SettingsModal from "./components/SettingsModal.svelte";
    import { eventStore } from "./stores/event";
    import { get } from "svelte/store";
    import { onMount } from "svelte";
    import { type MonitorFrame } from "../../shared/types";
    import { settingsStore } from "./stores/settings";

    const version = "v2.1.0";
    let settings = get(settingsStore);
    if (settings.version !== version) {
        settings.version = version;
        settingsStore.set(settings);
        console.log("Updated to " + version);
    }

    let lastFrameTime: Date;
    let frameCount = 0;
    let lastMessageTime: Date;
    let messageCount = 0;
    let reconnects = -1;

    let monitorEvent = get(eventStore) || "test";
    let relayOn = true; //get(relayStore);
    let secureOnly = true;
    let ws: WebSocket;
    let monitorFrame: MonitorFrame;

    let settingsOpen = false;
    function openSettings() {
        settingsOpen = true;
    }

    if (window.location.href.startsWith("https")) {
        relayOn = true;
        secureOnly = true;
    }

    async function connectToMonitor(evt: Event) {
        evt.preventDefault();
        if (ws) ws?.close();
        if (monitorEvent.match("^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$")) {
            let uri = "ws://" + monitorEvent + ":8284/";
            eventStore.set(monitorEvent);
            openWebSocket(uri);
        } else if (monitorEvent.trim().length > 0) {
            console.log(relayOn);
            eventStore.set(monitorEvent);
            const response = await fetch("https://ftabuddy.com/register/" + monitorEvent);
            const eventData = await response.json();
            if (response.status !== 200) {
                alert(response.statusText);
                return;
            }

            let uri = "ws://" + eventData.local_ip + ":8284/";
            if (relayOn) {
                uri = "wss://ftabuddy.com/ws";
            }

            openWebSocket(uri);
        }
    }

    function openWebSocket(uri: string) {
        console.log(uri);
        reconnects++;
        if (ws) ws.close();
        ws = new WebSocket(uri);
        ws.onopen = function () {
            console.log("Connected to " + uri);
            if (relayOn) {
                this.send("client-" + monitorEvent);
            }
            setInterval(() => ws.send("ping"), 60e3);
        };
        ws.onmessage = function (evt) {
            //console.log(evt.data);
            try {
                let data = JSON.parse(evt.data);
                if (data.type === "monitorUpdate") {
                    lastFrameTime = new Date();
                    frameCount++;
                    monitorFrame = data;
                } else if (data.type === "message") {
                    lastMessageTime = new Date();
                    messageCount++;
                    notesChild.newMessage(data);
                }
            } catch (e) {
                console.error(e);
            }
        };
        ws.onclose = function (evt) {
            if (!evt.wasClean) {
                console.log(evt);
                console.log("Disconnected from " + uri + " reconnecting in 5 sec");
                setTimeout(() => openWebSocket(uri), 5e3);
            } else {
                console.log("Disconnected cleanly");
            }
        };
    }

    let notesChild: Notes;

    onMount(() => {
        connectToMonitor(new Event("submit"));
    });
</script>

<SettingsModal bind:settingsOpen />

<main>
    <Router basepath="/app/">
        <div class="bg-neutral-800 w-screen h-screen flex flex-col">
            <div class="bg-primary-500 flex w-full justify-between px-2">
                <Button class="!py-0 !px-0" color="none" on:click={openSettings}>
                    <Icon icon="mdi:dots-vertical" class="w-6 h-8 sm:w-10 sm:h-12" />
                </Button>
                {#if settings.developerMode}
                    <div class="text-white text-left flex-grow text-sm">
                        <p>{settings.version} FS:{monitorFrame?.field}</p>
                        <p>Frames: {frameCount} {lastFrameTime?.toLocaleTimeString()}</p>
                        <p>Messages: {messageCount} {lastMessageTime?.toLocaleTimeString()}</p>
                        <p>Reconnects: {reconnects}</p>
                    </div>
                {/if}
                <div>
                    {#if !ws || ws.readyState !== 1}
                        <Icon icon="mdi:offline-bolt" class="w-6 h-8 sm:w-12 sm:h-12" />
                    {/if}
                </div>
            </div>

            <div class="overflow-y-auto flex-grow pb-2">
                <Route path="/">
                    <Home bind:monitorFrame updateEvent={connectToMonitor} />
                </Route>
                <Route path="/flashcards" component={Flashcard} />
                <Route path="/references" component={Reference} />
                <Route path="/notes">
                    <Notes bind:this={notesChild} team={undefined} />
                </Route>
                <Route path="/notes/:team" component={Notes} />
            </div>

            <div class="flex justify-around py-2 bg-neutral-700">
                <Link to="/app/">
                    <Button class="!p-2" color="none">
                        <Icon icon="mdi:television" class="w-8 h-8" />
                    </Button>
                </Link>
                <Link to="/app/flashcards">
                    <Button class="!p-2" color="none">
                        <Icon icon="mdi:message-alert" class="w-8 h-8" />
                    </Button>
                </Link>
                <Link to="/app/references">
                    <Button class="!p-2" color="none">
                        <Icon icon="mdi:file-document-outline" class="w-8 h-8" />
                    </Button>
                </Link>
                <Link to="/app/notes">
                    <Button class="!p-2" color="none">
                        <Icon icon="mdi:message-text" class="w-8 h-8" />
                    </Button>
                </Link>
            </div>
        </div>
    </Router>
</main>
