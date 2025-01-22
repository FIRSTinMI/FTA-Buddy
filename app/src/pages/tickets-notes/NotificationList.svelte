<script lang="ts">
	import NotificationCard from "../../components/NotificationCard.svelte";
	import { notificationsStore, clearNotifications } from "../../stores/notifications";
	import { Button } from "flowbite-svelte";
</script>

<div class="container max-w-6xl mx-auto px-2 pt-2 h-full flex flex-col gap-2">
	<div class="flex flex-col overflow-y-auto h-dvh">
		<div class="flex flex-col grow gap-2">
			<h1 class="text-3xl py-2" style="font-weight: bold">User Notifications</h1>
			<Button on:click={() => clearNotifications()}>Clear All Notifications</Button>
		</div>
		<div class="flex flex-col grow gap-2">
			{#if !$notificationsStore || $notificationsStore.length < 1}
				<div class="text-center">No Notifications Yet</div>
			{:else}
				{#each $notificationsStore as notification}
					<NotificationCard {notification} />
				{/each}
			{/if}
		</div>
	</div>
</div>
