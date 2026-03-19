<script lang="ts">
	let expanded = $state(false);
</script>

<div class="rounded-xl border border-neutral-700 bg-neutral-900 overflow-hidden">
	<button
		class="flex w-full items-center justify-between gap-3 p-4 text-left h-20"
		onclick={() => (expanded = !expanded)}
	>
		<div class="flex items-center gap-3">
			<span class="text-2xl">📡</span>
			<div>
				<p class="font-semibold">WPA Kiosk Tool</p>
				<p class="text-sm text-gray-400">Automatically update radio programming status on the checklist.</p>
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
		<div class="flex flex-col gap-2 px-4 pb-4 border-t border-neutral-700 pt-4 text-sm text-gray-400">
			<p>
				Connect your WPA Kiosk computer to WiFi and visit
				<code class="bg-neutral-800 px-2 py-0.5 rounded-lg">ftabuddy.com/kiosk</code>
				to set up the extension. Radio programming status will update the checklist automatically.
			</p>
		</div>
	{/if}
</div>
