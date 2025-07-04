<script lang="ts">
	import { onMount } from "svelte";
	import { Route, Router } from "svelte-routing";

	let StatusLights: typeof import("./StatusLights.svelte").default | null = null;
	let SoftwareDocs: typeof import("./SoftwareDocs.svelte").default | null = null;
	let WiringDiagrams: typeof import("./WiringDiagrams.svelte").default | null = null;
	let ComponentManuals: typeof import("./ComponentManuals.svelte").default | null = null;
	let FieldManuals: typeof import("./FieldManuals.svelte").default | null = null;
	let Reference: typeof import("./Reference.svelte").default | null = null;

	onMount(async () => {
		// Lazy load each component
		const [
			SL,
			SD,
			WD,
			CM,
			FM,
			Ref
		] = await Promise.all([
			import("./StatusLights.svelte"),
			import("./SoftwareDocs.svelte"),
			import("./WiringDiagrams.svelte"),
			import("./ComponentManuals.svelte"),
			import("./FieldManuals.svelte"),
			import("./Reference.svelte")
		]);

		StatusLights = SL.default;
		SoftwareDocs = SD.default;
		WiringDiagrams = WD.default;
		ComponentManuals = CM.default;
		FieldManuals = FM.default;
		Reference = Ref.default;
	});
</script>

<Router basepath="/references">
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

	<Route path="/fieldmanuals">
		{#if FieldManuals}
			<svelte:component this={FieldManuals} />
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
