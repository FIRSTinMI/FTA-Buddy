<script lang="ts">
	import { onMount } from "svelte";
	import { Route, Router } from "svelte-routing";

	export let toast: (title: string, text: string, color?: string) => void;
	export let installPrompt: Event | null;

	let CompleteGoogleSignup: any;
	let Host: any;
	let Login: any;
	let Management: any;
	let MeshedEvent: any;
	let PostEventCreation: any;
	let RadioKiosk: any;

	onMount(async () => {
		CompleteGoogleSignup = (await import("./CompleteGoogleSignup.svelte")).default;
		Host = (await import("./Host.svelte")).default;
		Login = (await import("./Login.svelte")).default;
		Management = (await import("./Management.svelte")).default;
		MeshedEvent = (await import("./MeshedEvent.svelte")).default;
		PostEventCreation = (await import("./PostEventCreation.svelte")).default;
		RadioKiosk = (await import("./RadioKiosk.svelte")).default;
	});
</script>

<Router basepath="/manage/">
	<Route path="/login">
		{#if Login}
			<svelte:component this={Login} {toast} {installPrompt} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/host">
		{#if Host}
			<svelte:component this={Host} {toast} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/kiosk">
		{#if RadioKiosk}
			<svelte:component this={RadioKiosk} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/event-created">
		{#if PostEventCreation}
			<svelte:component this={PostEventCreation} {toast} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/google-signup">
		{#if CompleteGoogleSignup}
			<svelte:component this={CompleteGoogleSignup} {toast} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/meshed-event">
		{#if MeshedEvent}
			<svelte:component this={MeshedEvent} {toast} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
	<Route path="/manage" component={Management}>
		{#if Management}
			<svelte:component this={Management} {toast} />
		{:else}
			<div>Loading...</div>
		{/if}
	</Route>
</Router>
