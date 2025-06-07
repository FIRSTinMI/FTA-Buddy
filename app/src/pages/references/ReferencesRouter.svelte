<script lang="ts">
	import { onMount } from "svelte";
	import { Route, Router } from "svelte-routing";

	let StatusLights: any;
	let SoftwareDocs: any;
	let WiringDiagrams: any;
	let ComponentManuals: any;
	let Reference: any;

	onMount(async () => {
		StatusLights = (await import("./StatusLights.svelte")).default;
		SoftwareDocs = (await import("./SoftwareDocs.svelte")).default;
		WiringDiagrams = (await import("./WiringDiagrams.svelte")).default;
		ComponentManuals = (await import("./ComponentManuals.svelte")).default;
		Reference = (await import("./Reference.svelte")).default;
	});
</script>

<Router basepath="/references/">
	<Route path="/statuslights">
		{#if StatusLights}
			<svelte:component this={StatusLights} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/softwaredocs">
		{#if SoftwareDocs}
			<svelte:component this={SoftwareDocs} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/wiringdiagrams">
		{#if WiringDiagrams}
			<svelte:component this={WiringDiagrams} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/componentmanuals">
		{#if ComponentManuals}
			<svelte:component this={ComponentManuals} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/">
		{#if Reference}
			<svelte:component this={Reference} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
</Router>
