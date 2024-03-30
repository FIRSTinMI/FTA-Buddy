<script lang="ts">
    import { Button, Modal, Spinner, Toggle } from "flowbite-svelte";
    import { get } from "svelte/store";
    import { settingsStore } from "../stores/settings";

    export let settingsOpen = false;
    export let openHelp: () => void;

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
</script>

{#if loading}
    <div class="fixed w-full h-full z-50 justify-center translate-y-1/2">
        <Spinner color="white" class="my-auto" />
    </div>
{/if}

<Modal bind:open={settingsOpen} size="lg" outsideclose dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
    <div slot="header"><h1 class="text-2xl">Settings</h1></div>
    <form class="space-y-2 justify-start text-left grid grid-cols-1">
        <Toggle bind:checked={settings.vibrations} on:change={updateSettings}>Vibrations</Toggle>
        <Toggle bind:checked={settings.soundAlerts} on:change={updateSettings}>Sound Alerts</Toggle>
        <Toggle bind:checked={settings.fieldGreen} on:change={updateSettings}>Field Green Alert</Toggle>
        <Toggle bind:checked={settings.susRobots} on:change={updateSettings}>👀 Sound Alerts</Toggle>
        <Toggle bind:checked={settings.developerMode} on:change={updateSettings}>Developer Mode</Toggle>
        {#if settings.developerMode}
            <Toggle bind:checked={settings.forceCloud} on:change={updateSettings}>Force cloud server</Toggle>
        {/if}
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
    </form>
    <div class="border-t border-neutral-500 pt-2 mt-0 flex flex-col">
        <h1 class="text-lg">About</h1>
        <p>Author: Filip Kin</p>
        <p>Version: {settings.version}</p>
        <a href="https://github.com/Filip-Kin/FTA-Buddy/" class="underline text-blue-400">GitHub</a>
    </div>
</Modal>
