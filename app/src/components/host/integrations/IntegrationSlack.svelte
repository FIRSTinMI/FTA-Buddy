<script lang="ts">
	import { eventStore } from "../../../stores/event";

	let expanded = $state(false);
</script>

<div class="rounded-xl border border-neutral-700 bg-neutral-900 overflow-hidden">
	<button
		class="flex w-full items-center justify-between gap-3 p-4 text-left h-20"
		onclick={() => (expanded = !expanded)}
	>
		<div class="flex items-center gap-3">
			<span class="text-2xl">💬</span>
			<div>
				<p class="font-semibold">Slack Bot</p>
				<p class="text-sm text-gray-400">Sync tickets with your CSA Slack channel.</p>
			</div>
		</div>
		<svg
			class="size-5 text-neutral-400 shrink-0 transition-transform {expanded ? 'rotate-180' : ''}"
			viewBox="0 0 20 20"
			fill="currentColor"
		>
			<path
				fill-rule="evenodd"
				d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
				clip-rule="evenodd"
			/>
		</svg>
	</button>

	{#if expanded}
		<div class="flex flex-col gap-3 px-4 pb-4 border-t border-neutral-700 pt-4">
			<p class="text-sm text-gray-400">Run these slash commands in your CSA Slack channel:</p>
			<div class="flex flex-col gap-1">
				<code class="bg-neutral-800 px-3 py-1.5 rounded-lg text-sm">/invite @FTA Buddy</code>
				<code class="bg-neutral-800 px-3 py-1.5 rounded-lg text-sm">
					/ftabuddy {$eventStore.code}
					{$eventStore.pin}
				</code>
			</div>
		</div>
	{/if}
</div>
