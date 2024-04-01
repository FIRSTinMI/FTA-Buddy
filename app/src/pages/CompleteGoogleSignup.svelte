<script lang="ts">
    import { Spinner, Label, Input, Select, Button } from "flowbite-svelte";
    import { get } from "svelte/store";
    import { trpc } from "../main";
    import { authStore } from "../stores/auth";
    
    export let toast: (title: string, text: string, color?: string) => void;

    let username = "";
    let role: "ADMIN" | "FTA" | "FTAA" | "CSA" = "FTA";

    let loading = false;

    async function createGoogleUser(evt: Event) {
        evt.preventDefault();
        loading = true;
        const googleToken = get(authStore).googleToken;

        try {
            const res = await trpc.user.createGoogleUser.query({
                token: googleToken || "",
                username,
                role,
            });

            authStore.set({
                token: res.token,
                eventToken: "",
                user: {
                    username,
                    email: res.email,
                    role,
                    id: res.id,
                },
                googleToken,
            });

            toast("Success", "Account created successfully", "green-500");
        } catch (err: any) {
            toast("Error Creating Account", err.message);
            console.error(err);
        }

        loading = false;
    }
</script>

{#if loading}
    <div class="fixed w-full h-full z-50 justify-center translate-y-1/2">
        <Spinner color="white" class="my-auto" />
    </div>
{/if}

<div
    class="container mx-auto md:max-w-3xl flex flex-col justify-center p-4 h-full space-y-4"
>
    <h1 class="text-3xl">Welcome to FTA Buddy</h1>
    <h2 class="text-xl">Finish Creating Account</h2>
    <form
        class="flex flex-col space-y-2 mt-2 text-left"
        on:submit={createGoogleUser}
    >
        <div>
            <Label for="username">Username</Label>
            <Input
                id="username"
                bind:value={username}
                placeholder="John"
                bind:disabled={loading}
            />
        </div>

        <div>
            <Label for="role">Role</Label>
            <Select
                id="role"
                bind:value={role}
                items={["FTA", "FTAA", "CSA", "RI"].map((v) => ({
                    name: v,
                    value: v,
                }))}
                bind:disabled={loading}
            />
        </div>

        <Button type="submit" bind:disabled={loading}>Create Account</Button>
    </form>
</div>
