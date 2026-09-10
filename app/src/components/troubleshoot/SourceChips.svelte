<script lang="ts">
	import Icon from "@iconify/svelte";
	import type { ChatCitation } from "../../../../src/router/troubleshoot";
	import { SOURCE_LABELS } from "../../../../src/util/troubleshoot/chat/types";

	let { citations }: { citations: ChatCitation[] } = $props();
</script>

{#if citations.length > 0}
	<div class="flex flex-wrap gap-1.5 mt-2">
		{#each citations as c (c.chunkId)}
			{@const label = SOURCE_LABELS[c.source] ?? c.source}
			{#if c.url}
				<a
					href={c.url}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-1 max-w-full rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-800 dark:text-gray-100 hover:border-primary-500"
					title={c.title}
				>
					<span
						class="shrink-0 rounded-full bg-gray-200 dark:bg-gray-700 px-1.5 text-[10px] uppercase tracking-wide"
						>{label}</span
					>
					<span class="truncate">{c.title}</span>
					<Icon icon="heroicons:arrow-top-right-on-square-16-solid" class="size-3 shrink-0" />
				</a>
			{:else}
				<span
					class="inline-flex items-center gap-1 max-w-full rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-800 dark:text-gray-100"
					title={c.title}
				>
					<span
						class="shrink-0 rounded-full bg-gray-200 dark:bg-gray-700 px-1.5 text-[10px] uppercase tracking-wide"
						>{label}</span
					>
					<span class="truncate">{c.title}</span>
				</span>
			{/if}
		{/each}
	</div>
{/if}
