<script lang="ts">
	import { Button, Input, Label, Select } from "flowbite-svelte";
	import { get } from "svelte/store";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { navigate } from "../../router";
	import { userStore } from "../../stores/user";
	import { toast } from "../../util/toast";

	let username = $state("");
	let role: "FTA" | "FTAA" | "CSA" | "RI" | undefined = $state();

	let loading = $state(false);

	async function createGoogleUser(evt: Event) {
		evt.preventDefault();
		loading = true;
		const googleToken = get(userStore).googleToken;

		try {
			const res = await trpc.user.createGoogleUser.mutate({
				token: googleToken || "",
				username,
				role: role || "FTA",
			});

			userStore.set({
				token: res.token,
				eventToken: "",
				username,
				email: res.email,
				role: role || "FTA",
				id: res.id,
				googleToken,
				admin: false,
			});

			toast("Success", "Account created successfully", "green-500");
			navigate("/manage/login");
		} catch (err: any) {
			console.error(err);
			if (err.message.startsWith("[")) {
				const obj = JSON.parse(err.message);
				for (const key in obj) {
					toast("Error Creating Account", obj[key].message);
				}
			} else {
				toast("Error Creating Account", err.message);
			}
		}

		loading = false;
	}
</script>

{#if loading}
	<Spinner />
{/if}

<div class="container mx-auto md:max-w-3xl flex flex-col justify-center p-4 h-full space-y-4 overflow-y-auto">
	<h1 class="text-3xl">Welcome to FTA Buddy</h1>
	<h2 class="text-xl">Finish Creating Account</h2>
	<form class="flex flex-col space-y-2 mt-2 text-left" onsubmit={createGoogleUser}>
		<div>
			<Label for="username">Username</Label>
			<Input id="username" bind:value={username} placeholder="John" disabled={loading} />
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
				disabled={loading}
			/>
		</div>

		<Button type="submit" disabled={loading}>Create Account</Button>
	</form>
</div>
