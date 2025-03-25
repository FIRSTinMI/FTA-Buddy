<script lang="ts">
	import { onMount, SvelteComponent } from "svelte";
	import { Route, Router } from "svelte-routing";

	let MatchLogList: any;
	let MatchLog: any;
	let StationLog: any;

	onMount(async () => {
		MatchLogList = (await import("./MatchLogsList.svelte")).default;
		MatchLog = (await import("./MatchLog.svelte")).default;
		StationLog = (await import("./StationLog.svelte")).default;
	});
</script>

<Router basepath="/logs/">
	<Route path="/">
		{#if MatchLogList}
			<svelte:component this={MatchLogList} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/:matchid" let:params>
		{#if MatchLog}
			<svelte:component this={MatchLog} matchid={params.matchid} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/:matchid/:station" let:params>
		{#if StationLog}
			<svelte:component this={StationLog} matchid={params.matchid} station={params.station} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
</Router>
