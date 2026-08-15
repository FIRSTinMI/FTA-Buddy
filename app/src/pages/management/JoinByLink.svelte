<script lang="ts">
	import { onMount, tick } from "svelte";
	import type { Profile, TeamList } from "../../../../shared/types";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { navigate, route } from "../../router";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";
	import { saveEvent } from "../../stores/savedEvents";
	import { auth, currentIdToken } from "../../util/firebase";
	import { toast } from "../../util/toast";

	let error = $state("");

	onMount(async () => {
		const token = route.params.token as string;

		// Gate on the REAL Firebase auth state, not the persisted userStore.token.
		// The store is restored from localStorage synchronously (so it can hold a
		// stale token from a previous session), but Firebase restores currentUser
		// asynchronously. Firing joinByToken before that finishes sends an empty
		// Authorization header -> the server rejects with "Missing Authorization
		// Header". authStateReady() resolves once the session is restored (or
		// definitively absent), so currentIdToken() is then authoritative.
		await auth.authStateReady();
		if (!(await currentIdToken())) {
			sessionStorage.setItem("redirectAfterLogin", `/join/${token}`);
			navigate("/manage/login");
			return;
		}

		try {
			const res = await trpc.event.joinByToken.mutate({ token });

			if (res.subEvents) {
				userStore.set({ ...$userStore, eventToken: res.token, meshedEventToken: res.token });
				eventStore.set({
					code: res.code,
					pin: res.pin,
					label: res.label,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					subEvents: res.subEvents,
					meshedEventCode: res.code,
					startDate: res.startDate ?? undefined,
					endDate: res.endDate ?? undefined,
					joinedAt: new Date().toISOString().split("T")[0],
				});
				saveEvent({
					code: res.code,
					token: res.token,
					pin: res.pin,
					label: res.label,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					subEvents: res.subEvents,
					meshedEventCode: res.code,
					startDate: res.startDate ?? undefined,
					endDate: res.endDate ?? undefined,
				});
				await tick();
				navigate("/dashboard");
			} else {
				userStore.set({ ...$userStore, eventToken: res.token });
				eventStore.set({
					code: res.code,
					pin: res.pin,
					label: res.label,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					startDate: res.startDate ?? undefined,
					endDate: res.endDate ?? undefined,
					joinedAt: new Date().toISOString().split("T")[0],
				});
				saveEvent({
					code: res.code,
					token: res.token,
					pin: res.pin,
					label: res.label,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					startDate: res.startDate ?? undefined,
					endDate: res.endDate ?? undefined,
				});
				await tick();
				navigate($userStore.role === "FTA" || $userStore.role === "FTAA" ? "/monitor" : "/notepad");
			}
			toast("Success", "Event joined successfully", "green-500");
		} catch (err: any) {
			error = err.message ?? "Invalid or expired link";
			toast("Error Joining Event", error);
		}
	});
</script>

<div class="flex items-center justify-center h-full">
	{#if error}
		<div class="flex flex-col items-center gap-3 text-center p-6">
			<p class="text-red-400 text-lg font-semibold">Failed to join event</p>
			<p class="text-gray-400">{error}</p>
			<button class="text-blue-400 underline" onclick={() => navigate("/manage/login")}> Go to login </button>
		</div>
	{:else}
		<Spinner />
	{/if}
</div>
