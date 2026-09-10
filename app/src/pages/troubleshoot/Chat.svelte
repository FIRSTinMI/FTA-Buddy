<script lang="ts">
	// Stub. The chat page is built separately and replaces this file.
	interface Props {
		tree?: string;
		path?: string;
	}
	let { tree, path }: Props = $props();
</script>

<div
	class="rounded-lg border border-gray-300 bg-white p-4 text-black dark:border-gray-600 dark:bg-gray-800 dark:text-white"
>
	<p class="font-semibold">Chat is not available yet.</p>
	<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">Use the Guided view or open a CSA ticket.</p>
	{#if tree}
		<p class="mt-2 text-xs text-gray-500 dark:text-gray-400">From guide: {tree}{path ? ` / ${path}` : ""}</p>
	{/if}
</div>
