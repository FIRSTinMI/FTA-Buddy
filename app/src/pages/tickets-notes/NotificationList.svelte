<script lang="ts">
	import { Button } from "flowbite-svelte";
	import NotificationCard from "../../components/NotificationCard.svelte";
	import { clearNotifications, notificationsStore } from "../../stores/notifications";
</script>

<div class="container max-w-6xl mx-auto px-2 pt-2 h-full flex flex-col gap-2">
	<div class="shrink-0 flex flex-col gap-2">
		<h1 class="text-3xl py-2" style="font-weight: bold">User Notifications</h1>
		<Button onclick={() => clearNotifications()}>Clear All Notifications</Button>
	</div>
	<div class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pb-2">
		{#if !$notificationsStore || $notificationsStore.length < 1}
			<div class="text-center">No Notifications Yet</div>
		{:else}
			{#each $notificationsStore as notification}
				<NotificationCard {notification} />
			{/each}
		{/if}
	</div>
</div>
