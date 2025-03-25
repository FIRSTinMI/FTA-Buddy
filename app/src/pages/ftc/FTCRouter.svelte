<script lang="ts">
	import { onMount } from "svelte";
	import { Route, Router } from "svelte-routing";

	let FTCStatus: any;

	onMount(async () => {
		FTCStatus = (await import("./FTCStatus.svelte")).default;
	});
</script>

<Router basepath="/ftc">
	<Route path="/">
		{#if FTCStatus}
			<svelte:component this={FTCStatus} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
</Router>
