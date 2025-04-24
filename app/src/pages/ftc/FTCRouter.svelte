<script lang="ts">
	import { onMount } from "svelte";
	import { Route, Router } from "svelte-routing";

	let FTCStatus: any = $state();

	onMount(async () => {
		FTCStatus = (await import("./FTCStatus.svelte")).default;
	});
</script>

<Router basepath="/ftc">
	<Route path="/">
		{#if FTCStatus}
			<FTCStatus />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
</Router>
