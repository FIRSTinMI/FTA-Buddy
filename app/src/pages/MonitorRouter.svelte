<script lang="ts">
	import { onMount } from "svelte";
	import { Route, Router } from "svelte-routing";
	import { get } from "svelte/store";
	import { frameHandler, subscribeToFieldMonitor } from "../field-monitor";
	import { userStore } from "../stores/user";

	export let fullscreen;

	let Monitor: any;

	let user = get(userStore);

	userStore.subscribe((value) => {
		if (user.eventToken !== value.eventToken) {
			user = value;
			// If the event has changed we want to reconnect with the new event token
			subscribeToFieldMonitor();
		} else {
			user = value;
		}
	});

	onMount(async () => {
		subscribeToFieldMonitor();
		Monitor = (await import("./Monitor.svelte")).default;
	});
</script>

<Router basepath="/monitor">
	<Route path="/">
		{#if Monitor}
			<svelte:component this={Monitor} {frameHandler} {fullscreen} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
</Router>
