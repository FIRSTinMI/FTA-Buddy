<script lang="ts">
    import Icon from "@iconify/svelte";
    import { Button, CloseButton, Drawer, Indicator, Modal, Sidebar, SidebarGroup, SidebarItem, SidebarWrapper, Toast } from "flowbite-svelte";
    import { onMount } from "svelte";
    import { Link, Route, Router, navigate } from "svelte-routing";
    import { get } from "svelte/store";
    import { type MonitorFrame, type StatusChanges, ROBOT, ESTOP, ASTOP, BYPASS } from "../../shared/types";
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
    import { sineIn } from "svelte/easing";
    import CompleteGoogleSignup from "./pages/CompleteGoogleSignup.svelte";
    import { eventStore } from "./stores/event";
    import { MatchState, MonitorFrameHandler, type MonitorEvent } from "./util/monitorFrameHandler";
    import { AudioQueuer } from "./util/audioAlerts";
    import Host from "./pages/Host.svelte";
    import PostEventCreation from "./pages/PostEventCreation.svelte";

    // Checking authentication

    let auth = get(authStore);
    const publicPaths = ["/app/login", "/app/google-signup", "/app/host", "/app/event-created"]

    if (!auth.token) {
        if (!auth.eventToken && window.location.pathname == "/app") {
            navigate("/app/login");
        } else if (!publicPaths.includes(window.location.pathname)) {
            navigate("/app/login");
        }
    }

    authStore.subscribe((value) => {
        if ((!value.token || !value.eventToken) && !publicPaths.includes(window.location.pathname)) {
            navigate("/app/login");
        }

        if (auth.eventToken !== value.eventToken) {
            auth = value;
            // If the event has changed we want to reconnect with the new event token
            openWebSocket();
        } else {
            auth = value;
        }
    });

    // Load settings

    let settings = get(settingsStore);
    settingsStore.subscribe((value) => {
        settings = value;
    });


    // Settings modal

    let settingsOpen = false;
    function openSettings() {
        settingsOpen = true;
    }


    // Version/changelog modal

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


    // Welcome modal

    let welcomeOpen = false;
    function openWelcome() {
        welcomeOpen = true;
    }


    // Update checking

    update(settings.version, version, openWelcome, openChangelog);

    // Toast manager

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
        }, 5000);
    }


    // App install prompt

    let installPrompt: Event | null = null;

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        installPrompt = event;
    });

    window.addEventListener("appinstalled", () => {
        installPrompt = null;
    });


    // Debugging stuff for websocket

    let lastFrameTime: Date;
    let frameCount = 0;
    let lastMessageTime: Date;
    let messageCount = 0;
    let reconnects = -1;

    let ws: WebSocket;
    let monitorFrame: MonitorFrame;


    // Local vibration and audio alert definitions

    const VIBRATION_PATTERNS = {
        ds: [500, 200, 500],
        radio: [200, 200, 500],
        rio: [200, 100, 200],
        code: [200],
        estop: [100]
    }

    
    const stops: {[key in ROBOT]: {a: boolean, e: boolean}} = {
        red1: { a: false, e: false },
        red2: { a: false, e: false },
        red3: { a: false, e: false },
        blue1: { a: false, e: false },
        blue2: { a: false, e: false },
        blue3: { a: false, e: false }
    }


    // Initialize frame handler and audio queue

    const frameHandler = new MonitorFrameHandler();
    const audioQueuer = new AudioQueuer();


    // Register event listeners for various frame events
    // Maybe we want to move this somewhere else?

    frameHandler.addEventListener('match-ready', (evt) => {
        console.log('Match ready');
        if (settings.fieldGreen) audioQueuer.addGreenClip();
    });

    for (let type of ['radio', 'rio', 'code']) {
        frameHandler.addEventListener(`${type}-drop`, (e) => {
            const evt = e as MonitorEvent;
            console.log(type+' drop', evt.detail);
            if (evt.detail.match === MatchState.RUNNING && evt.detail.frame[evt.detail.robot].ds !== BYPASS) {
                if (settings.vibrations) navigator.vibrate(VIBRATION_PATTERNS[type as 'radio' | 'rio' | 'code']);
                if (settings.soundAlerts) audioQueuer.addRobotClip(evt.detail.robot, type as 'radio' | 'rio' | 'code');
            }
        });
    }

    frameHandler.addEventListener(`ds-drop`, (e) => {
        const evt = e as MonitorEvent;
        console.log('DS drop', evt.detail);
        if (evt.detail.match === MatchState.RUNNING) {
            if (evt.detail.frame[evt.detail.robot].ds === ESTOP) {
                stops[evt.detail.robot].e = true;
                if (settings.vibrations) navigator.vibrate(VIBRATION_PATTERNS.estop);
            } else if (evt.detail.frame[evt.detail.robot].ds === ASTOP) {
                stops[evt.detail.robot].a = true;
                if (settings.vibrations) navigator.vibrate(VIBRATION_PATTERNS.estop);
            } else {
                if (settings.vibrations) navigator.vibrate(VIBRATION_PATTERNS.ds);
                if (settings.soundAlerts) audioQueuer.addRobotClip(evt.detail.robot, 'ds');
            }
        }
    });

    frameHandler.addEventListener('match-over', (evt) => {
        console.log('Match over');
        for (let robot in stops) {
            if (stops[robot as ROBOT].a) {
                if (settings.soundAlerts) audioQueuer.addRobotClip(robot as ROBOT, 'astop');
            }
            if (stops[robot as ROBOT].e) {
                if (settings.soundAlerts) audioQueuer.addRobotClip(robot as ROBOT, 'estop');
            }
            stops[robot as ROBOT] = { a: false, e: false };
        }
    });

    frameHandler.addEventListener('match-start', (evt) => {
        console.log('Match started');
    });


    // Update notification count

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

    let statusChanges: StatusChanges = {
        red1: { lastChange: new Date(), improved: true },
        red2: { lastChange: new Date(), improved: true },
        red3: { lastChange: new Date(), improved: true },
        blue1: { lastChange: new Date(), improved: true },
        blue2: { lastChange: new Date(), improved: true },
        blue3: { lastChange: new Date(), improved: true },
    };

    let event = get(eventStore);
    eventStore.subscribe((value) => {
        event = value;
    });


    // Websocket connection

    function openWebSocket() {
        if (ws) ws.close();

        const uri = `${server.split("://")[0].endsWith("s") ? "wss" : "ws"}://${server.split("://")[1]}/ws/`;

        console.log("Connecting to " + uri);

        ws = new WebSocket(uri);
        ws.onopen = function () {
            console.log("Connected to " + uri);
            this.send("client-" + auth.eventToken);
            setInterval(() => ws.send("ping"), 60e3);
        };

        ws.onmessage = function (evt) {
            try {
                let data = JSON.parse(evt.data);
                if (data.type === "monitorUpdate") {
                    // if (data.frameTime && data.frameTime + 60000 < new Date().getTime()) {
                    //     console.log("Skipping stale frame");
                    //     return;
                    // }
                    
                    lastFrameTime = new Date();
                    frameCount++;

                    frameHandler.feed(data);

                    for (let robot in ROBOT) {
                        batteryData[robot as ROBOT] = frameHandler.getHistory(robot as ROBOT, "battery", 20);
                    }

                    const _statusChanges = frameHandler.getStatusChanges();
                    if (_statusChanges) statusChanges = _statusChanges;

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
                console.log("Webscocket disconnected reconnecting in 5 sec");
                timeoutID = setTimeout(() => openWebSocket(), 5e3);
            } else {
                console.log("Disconnected cleanly");
            }
        };
    }


    // Monitor how long the page has been inactive (in background) so we can automatically reconnect
    // if the page has been inactive for too long the webscocket will die but not immediately so then you
    // have to wait like 10 seconds for it to start working again, this resolves that issue

    let inactiveStartTime = new Date().getTime();

    document.addEventListener("visibilitychange", (evt) => {
        if (document.visibilityState === "visible") {
            console.log("Returning from inactive");
            console.log(ws.readyState == 1 ? "Connected" : "Disconnected");
            console.log("Inactive for " + (new Date().getTime() - inactiveStartTime) + "ms");
            if (!ws || ws.readyState !== 1 || new Date().getTime() - inactiveStartTime > 60e3) {
                if (timeoutID) clearTimeout(timeoutID);
                openWebSocket();
            }
        } else {
            console.log("Going inactive");
            inactiveStartTime = new Date().getTime();
        }
    });


    // Stuff for the side menu

    let transitionParams = {
        x: -320,
        duration: 100,
        easing: sineIn,
    };
    let hideMenu = true;
    function openMenu() {
        hideMenu = false;
    }

    onMount(() => {
        openWebSocket();
    });


    // Check if we're in fullscreen
    let fullscreen = (window.outerWidth > 1900) ? window.innerHeight === 1080 : false;

    setInterval(() => {
        if (window.outerWidth > 1900)
            fullscreen = window.innerHeight === 1080;
    }, 200);
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
                    class="text-sm"
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
                    class="text-sm"
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
                    label="Fullscreen"
                    class="hidden md:flex text-sm"
                    on:click={(evt) => {
                        evt.preventDefault();
                        fullscreen = !fullscreen;
                        if (fullscreen) {
                            document.documentElement.requestFullscreen();
                        } else {
                            document.exitFullscreen();
                        }
                    }}
                >
                    <svelte:fragment slot="icon">
                        <Icon icon="mdi:fullscreen" class="w-8 h-8" />
                    </svelte:fragment>
                </SidebarItem>
                <SidebarItem
                    label="Help"
                    class="text-sm"
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
        {#if !fullscreen}
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
            <div class="flex-grow">
                <h1 class="text-white text-lg">{event.code}</h1>
            </div>
            <div>
                {#if !ws || ws.readyState !== 1}
                    <Icon icon="mdi:offline-bolt" class="w-8 h-10" />
                {/if}
            </div>
        </div>
        {/if}
        <Router basepath="/app/">
            <div class="overflow-y-auto flex-grow pb-2">
                <Route path="/">
                    <Home bind:monitorFrame bind:batteryData bind:statusChanges bind:fullscreen {frameHandler} />
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
            <Route path="/host">
                <Host {toast} />
            </Route>
            <Route path="/event-created">
                <PostEventCreation {toast} />
            </Route>
            <Route path="/google-signup">
                <CompleteGoogleSignup {toast} />
            </Route>

            {#if auth.token && auth.eventToken && !fullscreen}
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
