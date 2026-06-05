<script lang="ts">
	import { Button, Input, Label, Select } from "flowbite-svelte";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { navigate } from "../../router";
	import { userStore } from "../../stores/user";
	import { currentIdToken } from "../../util/firebase";
	import { firebaseAuthErrorMessage } from "../../util/firebaseErrors";
	import { toast } from "../../util/toast";

	let username = $state("");
	let role: "FTA" | "FTAA" | "CSA" | "RI" | undefined = $state();

	let loading = $state(false);

	async function finishSignup(evt: Event) {
		evt.preventDefault();
		if (!role) {
			toast("Error", "Please select a role");
			return;
		}
		loading = true;

		try {
			const res = await trpc.user.syncProfile.mutate({ username, role });
			if ("needsProfile" in res && res.needsProfile) {
				// Should not happen here, but guard anyway.
				toast("Error Creating Account", "Could not finish account setup. Please try again.");
				loading = false;
				return;
			}

			const p = res.user!;
			userStore.set({
				token: await currentIdToken(),
				eventToken: "",
				username: p.username,
				email: p.email,
				role: p.role,
				id: p.id,
				admin: p.admin,
			});

			toast("Success", "Account created successfully", "green-500");

			const redirect = sessionStorage.getItem("redirectAfterLogin");
			if (redirect) {
				sessionStorage.removeItem("redirectAfterLogin");
				navigate(redirect as any);
			} else {
				navigate("/manage/login");
			}
		} catch (err: any) {
			console.error(err);
			toast("Error Creating Account", firebaseAuthErrorMessage(err));
		}

		loading = false;
	}
</script>

{#if loading}
	<Spinner />
{/if}

<div class="h-full overflow-y-auto">
	<div class="container mx-auto md:max-w-3xl flex flex-col justify-center p-4 space-y-4">
		<h1 class="text-3xl">Welcome to FTA Buddy</h1>
		<h2 class="text-xl">Finish Creating Account</h2>
		<form class="flex flex-col space-y-2 mt-2 text-left" onsubmit={finishSignup}>
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
</div>
