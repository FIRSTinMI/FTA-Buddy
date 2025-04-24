<script lang="ts">
	import { onMount } from "svelte";
	import { Route, Router } from "svelte-routing";

	let TicketList: any = $state();
	let ViewTicket: any = $state();
	let PublicTicketCreate: any = $state();

	onMount(async () => {
		TicketList = (await import("./TicketList.svelte")).default;
		ViewTicket = (await import("./ViewTicket.svelte")).default;
		PublicTicketCreate = (await import("./PublicTicketCreate.svelte")).default;
	});
</script>

<Router basepath="ticket">
	<Route path="/">
		{#if TicketList}
			<TicketList />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/:team" >
		{#snippet children({ params })}
				{#if TicketList}
				<TicketList team={params.team} />
			{:else}
				<div>Loading...</div>
			{/if}
					{/snippet}
		</Route>
	<Route path="/view/:id" >
		{#snippet children({ params })}
				{#if ViewTicket}
				<ViewTicket id={params.id} />
			{:else}
				<div>Loading...</div>
			{/if}
					{/snippet}
		</Route>
	<Route path="/submit/:eventCode" >
		{#snippet children({ params })}
				{#if PublicTicketCreate}
				<PublicTicketCreate eventCode={params.eventCode} />
			{:else}
				<div>Loading...</div>
			{/if}
					{/snippet}
		</Route>
</Router>
