<script lang="ts">
	import { onMount } from "svelte";
	import { Route, Router } from "svelte-routing";

	let NoteList: any = $state();

	onMount(async () => {
		NoteList = (await import("./NoteList.svelte")).default;
	});
</script>

<Router basepath="/notes/">
	<Route path="/" >
		{#snippet children({ params })}
				{#if NoteList}
				<NoteList />
			{:else}
				<div>Loading...</div>
			{/if}
					{/snippet}
		</Route>
	<Route path="/:teamNumber" >
		{#snippet children({ params })}
				{#if NoteList}
				<NoteList teamNumber={params.teamNumber} />
			{:else}
				<div>Loading...</div>
			{/if}
					{/snippet}
		</Route>
</Router>
