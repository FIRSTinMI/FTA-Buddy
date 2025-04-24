<script lang="ts">
	import { onMount } from "svelte";
	import { Route, Router } from "svelte-routing";

	let StatusLights: any = $state();
	let SoftwareDocs: any = $state();
	let WiringDiagrams: any = $state();
	let ComponentManuals: any = $state();
	let FieldManuals: any = $state();
	let Reference: any = $state();

	onMount(async () => {
		StatusLights = (await import("./StatusLights.svelte")).default;
		SoftwareDocs = (await import("./SoftwareDocs.svelte")).default;
		WiringDiagrams = (await import("./WiringDiagrams.svelte")).default;
		ComponentManuals = (await import("./ComponentManuals.svelte")).default;
		FieldManuals = (await import("./FieldManuals.svelte")).default;
		Reference = (await import("./Reference.svelte")).default;
	});
</script>

<Router basepath="/references/">
	<Route path="/statuslights">
		{#if StatusLights}
			<StatusLights />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/softwaredocs">
		{#if SoftwareDocs}
			<SoftwareDocs />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/wiringdiagrams">
		{#if WiringDiagrams}
			<WiringDiagrams />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/componentmanuals">
		{#if ComponentManuals}
			<ComponentManuals />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/fieldmanuals">
		{#if FieldManuals}
			<FieldManuals />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/">
		{#if Reference}
			<Reference />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
</Router>
