<script lang="ts">
	import { onMount } from "svelte";
	import { Route, Router } from "svelte-routing";

	let NoteList: any;

	onMount(async () => {
		NoteList = (await import("./NoteList.svelte")).default;
	});
</script>

<Router basepath="/notes/">
	<Route path="/" let:params>
		{#if NoteList}
			<svelte:component this={NoteList} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/:teamNumber" let:params>
		{#if NoteList}
			<svelte:component this={NoteList} teamNumber={params.teamNumber} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
</Router>
