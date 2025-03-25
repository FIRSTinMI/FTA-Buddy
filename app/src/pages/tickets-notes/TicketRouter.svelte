<script lang="ts">
	import { onMount } from "svelte";
	import { Route, Router } from "svelte-routing";

	let TicketList: any;
	let ViewTicket: any;
	let PublicTicketCreate: any;

	onMount(async () => {
		TicketList = (await import("./TicketList.svelte")).default;
		ViewTicket = (await import("./ViewTicket.svelte")).default;
		PublicTicketCreate = (await import("./PublicTicketCreate.svelte")).default;
	});
</script>

<Router basepath="ticket">
	<Route path="/">
		{#if TicketList}
			<svelte:component this={TicketList} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/:team" let:params>
		{#if TicketList}
			<svelte:component this={TicketList} team={params.team} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/view/:id" let:params>
		{#if ViewTicket}
			<svelte:component this={ViewTicket} id={params.id} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/submit/:eventCode" let:params>
		{#if PublicTicketCreate}
			<svelte:component this={PublicTicketCreate} eventCode={params.eventCode} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
</Router>
