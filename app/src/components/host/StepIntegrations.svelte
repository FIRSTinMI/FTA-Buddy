<script lang="ts">
	import { Button } from "flowbite-svelte";
	import { navigate } from "../../router";
	import { eventStore } from "../../stores/event";
	import IntegrationAutoEvents from "./integrations/IntegrationAutoEvents.svelte";
	import IntegrationFmsFtaApp from "./integrations/IntegrationFmsFtaApp.svelte";
	import IntegrationNexus from "./integrations/IntegrationNexus.svelte";
</script>

<h1 class="text-3xl font-bold mb-2">Event Created!</h1>

<p class="text-lg mb-6">
	<strong>{$eventStore.code}</strong> is ready. Set up integrations below, or continue to the full Event Management
	page.
</p>

<div class="flex flex-col gap-3 mb-6">
	<IntegrationNexus />
	<IntegrationFmsFtaApp />
	<IntegrationAutoEvents />
</div>

<Button onclick={() => navigate("/manage/event-settings")}>Go to Event Management</Button>
