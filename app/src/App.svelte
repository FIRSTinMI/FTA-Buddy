<script lang="ts">
    import { Button, Modal, Toast } from "flowbite-svelte";
    import { get } from "svelte/store";
    import AppRouter from "./AppRouter.svelte";
    import SettingsModal from "./components/SettingsModal.svelte";
    import WelcomeModal from "./components/WelcomeModal.svelte";
    import { settingsStore } from "./stores/settings";
    import { VERSIONS, update } from "./util/updater";
    import { authStore } from "./stores/auth";
    import Login from "./pages/Login.svelte";
    import Icon from "@iconify/svelte";
    import { Router, Route } from "svelte-routing";

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

    let _lastFrameTime: Date;
    let _frameCount = 0;
    let _lastMessageTime: Date;
    let _messageCount = 0;
    let _reconnects = -1;

    function updateDevStats(lastFrameTime: Date, frameCount: number, lastMessageTime: Date, messageCount: number, reconnects: number) {
        _lastFrameTime = lastFrameTime;
        _frameCount = frameCount;
        _lastMessageTime = lastMessageTime;
        _messageCount = messageCount;
        _reconnects = reconnects;
    }

    let installPrompt: Event | null = null;

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        installPrompt = event;
    });

    window.addEventListener("appinstalled", () => {
        installPrompt = null;
    });

    let auth = get(authStore);

    if ((!auth.token || !auth.eventToken) && window.location.pathname !== "/login") {
        window.location.pathname = "/login";
    }
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

<main>
    <div class="bg-neutral-800 w-screen h-screen flex flex-col">
        <div class="bg-primary-500 flex w-full justify-between px-2">
            <Button class="!py-0 !px-0" color="none" on:click={openSettings}>
                <Icon icon="mdi:dots-vertical" class="w-6 h-8 sm:w-10 sm:h-12" />
            </Button>
            {#if settings.developerMode}
                <div class="text-white text-left flex-grow text-sm">
                    <p>{settings.version}</p>
                    <p>Frames: {_frameCount} {_lastFrameTime?.toLocaleTimeString()}</p>
                    <p>Messages: {_messageCount} {_lastMessageTime?.toLocaleTimeString()}</p>
                    <p>Reconnects: {_reconnects}</p>
                </div>
            {/if}
            <div>
                <!-- {#if !ws || ws.readyState !== 1}
                    <Icon icon="mdi:offline-bolt" class="w-6 h-8 sm:w-12 sm:h-12" />
                {/if} -->
            </div>
        </div>
        <Router>
            <Route path="/">
                <AppRouter {toast} {openSettings} {updateDevStats}></AppRouter>
            </Route>
            <Route path="/login">
                <Login {toast} />
            </Route>
        </Router>
    </div>
</main>
