<script lang="ts">
    import Icon from "@iconify/svelte";
    import { Button, CloseButton, Drawer, Indicator, Modal, Sidebar, SidebarGroup, SidebarItem, SidebarWrapper, Toast } from "flowbite-svelte";
    import { onMount } from "svelte";
    import { Link, Route, Router, navigate } from "svelte-routing";
    import { get } from "svelte/store";
    import { MATCH_RUNNING_AUTO, MATCH_RUNNING_TELEOP, MATCH_TRANSITIONING, type MonitorFrame } from "../../shared/types";
    import SettingsModal from "./components/SettingsModal.svelte";
    import WelcomeModal from "./components/WelcomeModal.svelte";
    import Flashcard from "./pages/Flashcards.svelte";
    import Home from "./pages/Home.svelte";
    import Login from "./pages/Login.svelte";
    import Messages from "./pages/Messages.svelte";
    import Reference from "./pages/Reference.svelte";
    import { authStore } from "./stores/auth";
    import { messagesStore } from "./stores/messages";
    import { settingsStore } from "./stores/settings";
    import { VERSIONS, update } from "./util/updater";
    import { server } from "./main";
    import { vibrateHandleMonitorFrame } from "./util/vibrateOnDrop";
    import { sineIn } from "svelte/easing";
    import type { StatusChange } from "../../src/stateChange";

    let auth = get(authStore);

    if ((!auth.token || !auth.eventToken) && window.location.pathname !== "/app/login") {
        navigate("/app/login");
    }

    let settings = get(settingsStore);
    settingsStore.subscribe((value) => {
        settings = value;
    });

    let settingsOpen = false;
    function openSettings() {
        settingsOpen = true;
    }

    const version = Object.keys(VERSIONS).sort().pop() || "0";
    let changelogOpen = false;
    let changelog = "";
    function openChangelog(text: string) {
        changelog = text;
        changelogOpen = true;
    }

    function openFullChangelog() {
        for (let version in VERSIONS) {
            changelog += VERSIONS[version as keyof typeof VERSIONS].changelog;
        }
        changelogOpen = true;
    }

    let welcomeOpen = false;
    function openWelcome() {
        welcomeOpen = true;
    }

    update(settings.version, version, openWelcome, openChangelog);

    let showToast = false;
    let toastTitle = "";
    let toastText = "";
    let toastColor = "red-500";
    function toast(title: string, text: string, color = "red-500") {
        toastTitle = title;
        toastText = text;
        toastColor = color;
        showToast = true;
        setTimeout(() => {
            showToast = false;
        }, 10000);
    }

    let installPrompt: Event | null = null;

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        installPrompt = event;
    });

    window.addEventListener("appinstalled", () => {
        installPrompt = null;
    });

    let lastFrameTime: Date;
    let frameCount = 0;
    let lastMessageTime: Date;
    let messageCount = 0;
    let reconnects = -1;

    let ws: WebSocket;
    let monitorFrame: MonitorFrame;

    let notifications = get(messagesStore).unread || 0;
    messagesStore.subscribe((value) => {
        notifications = value.unread;
    });

    let timeoutID: NodeJS.Timeout;

    let messagesChild: Messages;

    let batteryData = {
        red1: new Array(20).fill(0),
        red2: new Array(20).fill(0),
        red3: new Array(20).fill(0),
        blue1: new Array(20).fill(0),
        blue2: new Array(20).fill(0),
        blue3: new Array(20).fill(0),
    };

    let statusChanges: StatusChange = {
        red1: { lastChange: new Date(), improved: true },
        red2: { lastChange: new Date(), improved: true },
        red3: { lastChange: new Date(), improved: true },
        blue1: { lastChange: new Date(), improved: true },
        blue2: { lastChange: new Date(), improved: true },
        blue3: { lastChange: new Date(), improved: true },
    };

    function openWebSocket() {
        const uri = `${server.split("://")[0].endsWith("s") ? "wss" : "ws"}://${server.split("://")[1]}/ws/`;

        console.log("Connecting to " + uri);

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
                    for (let key of Object.keys(batteryData)) {
                        let array = batteryData[key as keyof typeof batteryData];
                        array.push(data[key].battery);
                        if (array.length > 20) {
                            array.shift();
                        }
                        batteryData[key as keyof typeof batteryData] = array;
                    }

                    for (let key of Object.keys(data.statusChanges)) {
                        let change = data.statusChanges[key];
                        statusChanges[key as keyof typeof statusChanges] = {
                            lastChange: new Date(change.lastChange),
                            improved: change.improved,
                        };
                    }

                    statusChanges = statusChanges;

                    if (settings.vibrations && [MATCH_RUNNING_TELEOP, MATCH_RUNNING_AUTO, MATCH_TRANSITIONING].includes(data.field)) {
                        vibrateHandleMonitorFrame(data, monitorFrame);
                    }

                    batteryData = batteryData;
                    monitorFrame = data;
                } else if (data.type === "message") {
                    notifications++;
                    messagesStore.update((s) => {
                        s.unread = notifications;
                        return s;
                    });
                    lastMessageTime = new Date();
                    messageCount++;
                    if (messagesChild) messagesChild.newMessage(data);
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

    let transitionParams = {
        x: -320,
        duration: 100,
        easing: sineIn,
    };
    let hideMenu = true;
    function openMenu() {
        hideMenu = false;
    }
    authStore.subscribe((value) => {
        auth = value;
        if ((!auth.token || !auth.eventToken) && window.location.pathname !== "/app/login") {
            navigate("/app/login");
        }
    });

    onMount(() => {
        openWebSocket();
    });
</script>

{#if showToast}
    <div class="fixed bottom-0 left-0 p-4">
        <Toast bind:open={showToast} class="dark:bg-{toastColor}" divClass="w-lg p-4 text-gray-500 bg-white shadow dark:text-gray-400 dark:bg-gray-800 gap-3">
            <h3 class="text-lg font-bold text-white text-left">{toastTitle}</h3>
            <p class="text-white text-left">{toastText}</p>
        </Toast>
    </div>
{/if}

<WelcomeModal
    bind:welcomeOpen
    bind:installPrompt
    openChangelog={() => {
        welcomeOpen = false;
        openFullChangelog();
    }}
    closeModal={() => {
        welcomeOpen = false;
    }}
/>

<Modal bind:open={changelogOpen} dismissable autoclose outsideclose>
    <div slot="header">
        <h1 class="text-2xl font-bold">Changelog</h1>
    </div>
    <div bind:innerHTML={changelog} contenteditable class="text-left" />
    <div slot="footer">
        <Button color="primary">Close</Button>
    </div>
</Modal>

<SettingsModal
    bind:settingsOpen
    bind:installPrompt
    openHelp={() => {
        settingsOpen = false;
        welcomeOpen = true;
    }}
/>

<Drawer transitionType="fly" {transitionParams} bind:hidden={hideMenu} id="sidebar">
    <div class="flex items-center">
        <h5 id="drawer-navigation-label-3" class="text-base font-semibold text-gray-500 uppercase dark:text-gray-400">Menu</h5>
        <CloseButton on:click={() => (hideMenu = true)} class="mb-4 dark:text-white" />
    </div>
    <Sidebar>
        <SidebarWrapper divClass="overflow-y-auto py-4 px-3 rounded dark:bg-gray-800">
            {#if auth.token && auth.eventToken}
                <SidebarGroup>
                    <SidebarItem
                        label="Monitor"
                        on:click={() => {
                            hideMenu = true;
                            navigate("/app/");
                        }}
                    >
                        <svelte:fragment slot="icon">
                            <Icon icon="mdi:television" class="w-8 h-8" />
                        </svelte:fragment>
                    </SidebarItem>
                    <SidebarItem
                        label="Flashcards"
                        on:click={() => {
                            hideMenu = true;
                            navigate("/app/flashcards");
                        }}
                    >
                        <svelte:fragment slot="icon">
                            <Icon icon="mdi:message-alert" class="w-8 h-8" />
                        </svelte:fragment>
                    </SidebarItem>
                    <SidebarItem
                        label="References"
                        on:click={() => {
                            hideMenu = true;
                            navigate("/app/references");
                        }}
                    >
                        <svelte:fragment slot="icon">
                            <Icon icon="mdi:file-document-outline" class="w-8 h-8" />
                        </svelte:fragment>
                    </SidebarItem>
                    <SidebarItem
                        label="Messages"
                        on:click={() => {
                            hideMenu = true;
                            navigate("/app/messages");
                        }}
                    >
                        <svelte:fragment slot="icon">
                            <Icon icon="mdi:message-text" class="w-8 h-8" />
                        </svelte:fragment>
                        {#if notifications > 0}
                            <Indicator color="red" border size="xl" placement="top-left">
                                <span
                                    class="text-white
                                text-xs">{notifications}</span
                                >
                            </Indicator>
                        {/if}
                    </SidebarItem>
                </SidebarGroup>
            {/if}
            <SidebarGroup class="border-t-2 mt-2 pt-2 border-neutral-400">
                <SidebarItem
                    label="Settings"
                    on:click={(evt) => {
                        evt.preventDefault();
                        hideMenu = true;
                        openSettings();
                    }}
                >
                    <svelte:fragment slot="icon">
                        <Icon icon="mdi:cog" class="w-8 h-8" />
                    </svelte:fragment>
                </SidebarItem>
                <SidebarItem
                    label="Change Event/Account"
                    on:click={() => {
                        hideMenu = true;
                        navigate("/app/login");
                    }}
                >
                    <svelte:fragment slot="icon">
                        <Icon icon="mdi:account-switch" class="w-8 h-8" />
                    </svelte:fragment>
                </SidebarItem>
                <SidebarItem
                    label="Help"
                    on:click={(evt) => {
                        evt.preventDefault();
                        hideMenu = true;
                        openWelcome();
                    }}
                >
                    <svelte:fragment slot="icon">
                        <Icon icon="mdi:information" class="w-8 h-8" />
                    </svelte:fragment>
                </SidebarItem>
            </SidebarGroup>
        </SidebarWrapper>
    </Sidebar>
</Drawer>

<main>
    <div class="bg-neutral-800 w-screen h-screen flex flex-col">
        <div class="bg-primary-500 flex w-full justify-between px-2">
            <Button class="!py-0 !px-0" color="none" on:click={openMenu}>
                <Icon icon="mdi:menu" class="w-8 h-10" />
            </Button>
            {#if settings.developerMode}
                <div class="text-white text-left flex-grow text-sm">
                    <p>{settings.version}</p>
                    <p>
                        Frames: {frameCount}
                        {lastFrameTime?.toLocaleTimeString()}
                    </p>
                    <p>
                        Messages: {messageCount}
                        {lastMessageTime?.toLocaleTimeString()}
                    </p>
                    <p>Reconnects: {reconnects}</p>
                </div>
            {/if}
            <div>
                {#if !ws || ws.readyState !== 1}
                    <Icon icon="mdi:offline-bolt" class="w-8 h-10" />
                {/if}
            </div>
        </div>
        <Router basepath="/app/">
            <div class="overflow-y-auto flex-grow pb-2">
                <Route path="/">
                    <Home bind:monitorFrame bind:batteryData bind:statusChanges />
                </Route>
                <Route path="/flashcards" component={Flashcard} />
                <Route path="/references" component={Reference} />
                <Route path="/messages">
                    <Messages bind:this={messagesChild} team={undefined} />
                </Route>
                <Route path="/messages/:team" component={Messages} />
            </div>
            <Route path="/login">
                <Login {toast} />
            </Route>

            {#if window.location.pathname !== "/app/login"}
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
                    <Link to="/app/messages">
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
            {/if}
        </Router>
    </div>
</main>
