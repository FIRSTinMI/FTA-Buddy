<script lang="ts">
	import { Button, Toast } from "flowbite-svelte";

	export let show = false;
	export let newVersion = "";

	async function hardRefresh() {
		try {
			const regs = await navigator.serviceWorker.getRegistrations();
			await Promise.all(regs.map((r) => r.unregister()));
			const keys = await caches.keys();
			await Promise.all(keys.map((k) => caches.delete(k)));
		} catch {
			// non-fatal — still reload even if SW/cache cleanup fails
		}
		window.location.reload();
	}
</script>

{#if show}
	<div class="fixed bottom-0 left-0 p-4">
		<Toast
			class="w-lg p-4 bg-blue-400 dark:bg-blue-500 shadow-sm gap-3 items-start text-black dark:text-white"
			contentClass="flex flex-col w-full text-sm font-normal"
		>
			<h3 class="text-lg font-bold text-left">Update</h3>
			<p class="text-left">Version v{newVersion} is available</p>

			<Button onclick={hardRefresh} class="mt-1 ml-0" color="blue">Refresh</Button>
		</Toast>
	</div>
{/if}
