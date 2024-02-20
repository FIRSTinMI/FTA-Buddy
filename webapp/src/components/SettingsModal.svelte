<script lang="ts">
    import { Button, ButtonGroup, Input, Label, Modal, Spinner, Toast, Toggle } from "flowbite-svelte";
    import { get } from "svelte/store";
    import { userStore } from "../stores/user";
    import { settingsStore } from "../stores/settings";

    export let settingsOpen = false;
    export let openHelp: () => void;
    let user = get(userStore);
    let settings = get(settingsStore);
    export let installPrompt: Event | null;

    let createAccount = true;
    let username = "";
    let password = "";
    let verifyPassword = "";

    let toastText = "";
    let loading = false;

    async function createUser(evt: Event) {
        evt.preventDefault();
        if (password !== verifyPassword) {
            toastText = "Passwords do not match";
            return;
        }
        loading = true;
        try {
            const response = await fetch("https://ftabuddy.com/profile", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    username: username,
                    password: password,
                }),
            });
            const body = await response.json();

            if (response.ok) {
                toastText = "Account created successfully";
                userStore.set({ id: body.id, username: username, token: body.token });
                setTimeout(window.location.reload, 500);
            } else {
                toastText = body.error;
            }
        } catch (error) {
            toastText = "Error creating account";
        }
        loading = false;
    }

    async function login(evt: Event) {
        evt.preventDefault();
        loading = true;
        try {
            const response = await fetch("https://ftabuddy.com/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    username: username,
                    password: password,
                }),
            });
            const body = await response.json();

            if (response.ok) {
                toastText = "Logged in successfully";
                userStore.set({ id: body.id, username: username, token: body.token });
                user = get(userStore);
                setTimeout(window.location.reload, 500);
            } else {
                toastText = body.error;
            }
        } catch (error) {
            toastText = "Error logging in";
        }
        loading = false;
    }

    function logout() {
        userStore.set({ id: 0, username: "", token: "" });
        user = get(userStore);
    }

    function switchLoginCreate() {
        createAccount = !createAccount;
    }

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

<Modal
    bind:open={settingsOpen}
    size="lg"
    outsideclose
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex"
>
    <form class="space-y-4 justify-start text-left grid grid-cols-1">
        <h1 class="text-2xl">Settings</h1>
        {#if installPrompt}
            <Button
                color="primary"
                class="w-fit"
                size="xs"
                on:click={() => {
                    // @ts-ignore
                    if (installPrompt) installPrompt.prompt();
                }}>Install</Button
            >
        {/if}
        <Button on:click={openHelp} size="xs" color="primary" class="w-fit">Help</Button>
        <Button on:click={clearStorage} size="xs" color="dark" class="w-fit">Clear All Data</Button>
        <Toggle bind:checked={settings.developerMode} on:change={updateSettings}>Developer Mode</Toggle>
    </form>
    <div class="border-t border-neutral-500 pt-2 mt-0">
        {#if !user || user.id < 1}
            {#if createAccount}
                <h2 class="text-xl">Create Account</h2>
                <Button on:click={switchLoginCreate} size="xs">Or Login</Button>
                <form class="flex flex-col space-y-2 mt-2" on:submit={createUser}>
                    <Input bind:value={username} placeholder="Username" bind:disabled={loading} />
                    <Input bind:value={password} type="password" placeholder="Password" bind:disabled={loading} />
                    <Input
                        bind:value={verifyPassword}
                        type="password"
                        placeholder="Verify Password"
                        bind:disabled={loading}
                    />
                    <Button type="submit" bind:disabled={loading}>Create Account</Button>
                    <p class="text-red-500">{toastText}</p>
                </form>
            {:else}
                <h2 class="text-xl">Login</h2>
                <Button on:click={switchLoginCreate} size="xs">Or Create Account</Button>
                <form class="flex flex-col space-y-2 mt-2" on:submit={login}>
                    <Input bind:value={username} placeholder="Username" bind:disabled={loading} />
                    <Input bind:value={password} type="password" placeholder="Password" bind:disabled={loading} />
                    <Button type="submit" bind:disabled={loading}>Login</Button>
                    <p class="text-red-500">{toastText}</p>
                </form>
            {/if}
        {:else}
            <h2 class="text-lg">Logged in as {user.username}</h2>
            <Button on:click={logout}>Logout</Button>
        {/if}
    </div>
    <div class="border-t border-neutral-500 pt-2 mt-0 flex flex-col">
        <h1 class="text-lg">About</h1>
        <p>Author: Filip Kin</p>
        <p>Version: {settings.version}</p>
        <a href="https://github.com/Filip-Kin/FTA-Buddy/" class="underline text-blue-400">GitHub</a>
    </div>
</Modal>
