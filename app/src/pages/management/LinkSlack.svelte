<script lang="ts">
	import { onMount } from "svelte";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { navigate, route } from "../../router";
	import { userStore } from "../../stores/user";
	import { toast } from "../../util/toast";

	let error = $state("");
	let success = $state(false);

	onMount(async () => {
		const token = route.params.token as string;

		if (!$userStore.token) {
			sessionStorage.setItem("redirectAfterLogin", `/link-slack/${token}`);
			navigate("/manage/login");
			return;
		}

		try {
			const res = await trpc.user.redeemSlackLinkToken.mutate({ token });
			userStore.update((u) => ({ ...u, slack_user_id: res.slackUserId }));
			success = true;
			toast("Slack Linked", "Your Slack account has been linked to FTA-Buddy", "green-500");
		} catch (err: any) {
			error = err.message ?? "Invalid or expired link";
			toast("Error", error);
		}
	});
</script>

<div class="flex items-center justify-center h-full">
	{#if error}
		<div class="flex flex-col items-center gap-3 text-center p-6">
			<p class="text-red-400 text-lg font-semibold">Failed to link Slack account</p>
			<p class="text-gray-400">{error}</p>
			<button class="text-blue-400 underline" onclick={() => navigate("/manage/login")}>Go to login</button>
		</div>
	{:else if success}
		<div class="flex flex-col items-center gap-3 text-center p-6">
			<p class="text-green-400 text-lg font-semibold">✅ Slack account linked!</p>
			<p class="text-gray-400">Your Slack identity is now connected to FTA-Buddy.</p>
			<button class="text-blue-400 underline" onclick={() => navigate("/")}>Go to App</button>
		</div>
	{:else}
		<Spinner />
	{/if}
</div>
