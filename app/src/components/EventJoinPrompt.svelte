<script lang="ts">
	import { Button, Input, Label } from "flowbite-svelte";
	import type { Profile } from "../../../shared/types";
	import Spinner from "./Spinner.svelte";
	import { trpc } from "../main";
	import { eventStore } from "../stores/event";
	import { userStore } from "../stores/user";
	import { saveEvent } from "../stores/savedEvents";
	import { toast } from "../util/toast";

	interface Props {
		eventCode: string;
		onSuccess: () => void;
	}

	let { eventCode, onSuccess }: Props = $props();

	let pin = $state("");
	let loading = $state(false);

	async function join(evt: SubmitEvent) {
		evt.preventDefault();
		loading = true;
		try {
			const res = await trpc.event.join.mutate({ code: eventCode, pin });

			if (res.subEvents) {
				userStore.update((u) => ({ ...u, eventToken: res.token, meshedEventToken: res.token }));
				eventStore.set({
					code: res.code,
					pin: res.pin,
					teams: res.teams as { number: string; name: string; inspected: boolean }[],
					users: res.users as Profile[],
					subEvents: res.subEvents,
					meshedEventCode: res.code,
				});
				saveEvent({
					code: res.code,
					token: res.token,
					pin: res.pin,
					teams: res.teams as { number: string; name: string; inspected: boolean }[],
					users: res.users as Profile[],
					subEvents: res.subEvents,
					meshedEventCode: res.code,
				});
			} else {
				userStore.update((u) => ({ ...u, eventToken: res.token }));
				eventStore.set({
					code: res.code,
					pin: res.pin,
					teams: res.teams as { number: string; name: string; inspected: boolean }[],
					users: res.users as Profile[],
				});
				saveEvent({
					code: res.code,
					token: res.token,
					pin: res.pin,
					teams: res.teams as { number: string; name: string; inspected: boolean }[],
					users: res.users as Profile[],
				});
			}

			toast("Success", "Event joined successfully", "green-500");
			onSuccess();
		} catch (err: any) {
			toast("Error Joining Event", err.message);
		} finally {
			loading = false;
		}
	}
</script>

{#if loading}
	<Spinner />
{/if}

<div class="flex flex-col gap-4 max-w-sm mx-auto mt-8">
	<h2 class="text-xl font-bold">Join Event</h2>
	<p class="text-gray-600 text-sm">
		This link is for event <span class="font-mono font-semibold">{eventCode}</span>. Enter the event password to
		switch to it.
	</p>
	<form class="flex flex-col gap-3" onsubmit={join}>
		<div>
			<Label for="ejp-code">Event Code</Label>
			<Input id="ejp-code" value={eventCode} disabled />
		</div>
		<div>
			<Label for="ejp-pin">Event Password</Label>
			<Input id="ejp-pin" bind:value={pin} placeholder="robot-field-42" type="password" disabled={loading} />
		</div>
		<Button type="submit" disabled={loading}>Join Event</Button>
	</form>
</div>
