<script lang="ts">
    import { Button, Input, Modal } from "flowbite-svelte";
    import { get } from "svelte/store";
    import { userStore } from "../stores/user";
    import Spinner from "./Spinner.svelte";

    export let loginOpen = false;
    let user = get(userStore);

    let createAccount = true;
    let username = "";
    let password = "";
    let verifyPassword = "";

    let toastText = "";
    let loading = false;

    async function createUser(evt: Event) {
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
</script>

{#if loading}
    <div class="fixed w-full h-full z-50 justify-center translate-y-1/2">
        <Spinner />
    </div>
{/if}

<Modal
    bind:open={loginOpen}
    size="md"
    outsideclose
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex"
>
    <div slot="header"><h1 class="text-2xl">Account</h1></div>
    <div>
        {#if !user || user.id < 1}
            {#if createAccount}
                <h2 class="text-xl">Create Account</h2>
                <Button on:click={switchLoginCreate} size="xs">Or Login</Button>
                <form class="flex flex-col space-y-2 mt-2" on:submit|preventDefault={createUser}>
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
                <form class="flex flex-col space-y-2 mt-2" on:submit|preventDefault={login}>
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
</Modal>
