<script lang="ts">
    import { Button, Modal, Toggle } from "flowbite-svelte";
    import { get } from "svelte/store";
    import { settingsStore } from "../stores/settings";
    import Spinner from "./Spinner.svelte";

    export let settingsOpen = false;

    let settings = get(settingsStore);
    export let installPrompt: Event | null;

    let loading = false;

    function updateSettings() {
        settingsStore.set(settings);
    }

    function clearStorage() {
        localStorage.clear();
        window.location.reload();
    }

    function requestNotificationPermissions() {
        if (Notification.permission !== "granted") {
            Notification.requestPermission().then((permission) => {
                if (permission === "granted") {
                    updateSettings();
                }
            });
        } else {
            updateSettings();
        }
    }
</script>

{#if loading}
    <Spinner />
{/if}

<Modal bind:open={settingsOpen} size="lg" outsideclose dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
    <div slot="header"><h1 class="text-2xl text-black dark:text-white">Settings</h1></div>
    <form class="justify-start text-left">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div class="grid grid-cols-subgrid gap-2 row-span-5">
                <p class="text-gray-700 dark:text-gray-400">General</p>
                <Toggle bind:checked={settings.vibrations} on:change={updateSettings}>Vibrations</Toggle>
                <Toggle bind:checked={settings.notifications} on:change={requestNotificationPermissions}>Ticket Notifications</Toggle>
                <Toggle bind:checked={settings.robotNotifications} on:change={requestNotificationPermissions}>Robot Connection Notifications</Toggle>
                <Toggle bind:checked={settings.darkMode} on:change={updateSettings}>Dark Mode</Toggle>
            </div>
            <div class="grid grid-cols-subgrid gap-2 row-span-4">
                <p class="text-gray-700 dark:text-gray-400">Audio Alerts</p>
                <Toggle bind:checked={settings.soundAlerts} on:change={updateSettings}>Robot Connection</Toggle>
                <Toggle bind:checked={settings.fieldGreen} on:change={updateSettings}>Field Green</Toggle>
                <Toggle bind:checked={settings.susRobots} on:change={updateSettings}>👀 Alerts</Toggle>
            </div>
            <div class="grid grid-cols-subgrid gap-2 row-span-3">
                <p class="text-gray-700 dark:text-gray-400">Other</p>
                <Toggle bind:checked={settings.inspectionAlerts} on:change={updateSettings}>🔍 Missing inspection icon on field monitor</Toggle>
                <Toggle bind:checked={settings.fimSpecifics} on:change={updateSettings}>FIM Specific Field Manuals</Toggle>
            </div>  
            <div class="grid grid-cols-subgrid gap-2 row-span-3">
                <p class="text-gray-700 dark:text-gray-400">Developer</p>
                <Toggle bind:checked={settings.developerMode} on:change={updateSettings}>Developer Mode</Toggle>
                <Toggle bind:checked={settings.forceCloud} on:change={updateSettings}>Force cloud server</Toggle>
            </div>
            <div class="grid gap-2 md:col-span-2">
                {#if installPrompt}
                    <Button
                        color="primary"
                        size="xs"
                        on:click={() => {
                            // @ts-ignore
                            if (installPrompt) installPrompt.prompt();
                        }}>Install</Button
                    >
                {/if}
                <Button on:click={clearStorage} size="xs" color="red">Clear All Data</Button>
            </div>
        </div>
    </form>
    <div class="border-t border-neutral-500 pt-2 mt-0 flex flex-col text-black dark:text-white">
        <h1 class="text-lg">About</h1>
        <p>Author: Filip Kin</p>
        <p>Version: {settings.version}</p>
        <a href="https://github.com/Filip-Kin/FTA-Buddy/" class="underline text-blue-400">GitHub</a>
    </div>
</Modal>
