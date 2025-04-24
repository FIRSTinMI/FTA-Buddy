<script lang="ts">
	import { onMount } from "svelte";
	import { Route, Router } from "svelte-routing";

	let MatchLogList: any = $state();
	let MatchLog: any = $state();
	let StationLog: any = $state();

	onMount(async () => {
		MatchLogList = (await import("./MatchLogsList.svelte")).default;
		MatchLog = (await import("./MatchLog.svelte")).default;
		StationLog = (await import("./StationLog.svelte")).default;
	});
</script>

<Router basepath="/logs/">
	<Route path="/">
		{#if MatchLogList}
			<MatchLogList />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/:matchid" >
		{#snippet children({ params })}
				{#if MatchLog}
				<MatchLog matchid={params.matchid} />
			{:else}
				<div>Loading...</div>
			{/if}
					{/snippet}
		</Route>
	<Route path="/:matchid/:station" >
		{#snippet children({ params })}
				{#if StationLog}
				<StationLog matchid={params.matchid} station={params.station} />
			{:else}
				<div>Loading...</div>
			{/if}
					{/snippet}
		</Route>
</Router>
