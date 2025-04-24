<script lang="ts">
	import { Button, Toast } from "flowbite-svelte";

	export let show = false;
	export let newVersion = "";
</script>

{#if show}
	<div class="fixed bottom-0 left-0 p-4">
		<Toast
			bind:open={show}
			class="bg-blue-400 dark:bg-blue-500 justify-left"
			contentClass="flex flex-col w-full text-sm font-normal"
			divClass="w-lg p-4 text-black shadow-sm dark:text-white gap-3 items-start"
		>
			<h3 class="text-lg font-bold text-left">Update</h3>
			<p class="text-left">Version v{newVersion} is available</p>
			<Button on:click={() => window.location.reload()} class="mt-1 ml-0" color="blue">Refresh</Button>
		</Toast>
	</div>
{/if}
