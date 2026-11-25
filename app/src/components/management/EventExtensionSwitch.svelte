<script lang="ts">
	let {
		on,
		busy = false,
		label,
		ontoggle,
	}: { on: boolean; busy?: boolean; label: string; ontoggle: (next: boolean) => void } = $props();
</script>

<div class="flex items-center gap-2">
	<button
		type="button"
		role="switch"
		aria-checked={on}
		aria-label={label}
		disabled={busy}
		onclick={() => ontoggle(!on)}
		class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 {on
			? 'bg-green-600'
			: 'bg-red-600'}"
	>
		<span
			class="inline-block h-5 w-5 rounded-full bg-white transition-transform {on
				? 'translate-x-5'
				: 'translate-x-0.5'}"
		></span>
	</button>
	<span class="text-sm font-medium {on ? 'text-gray-700 dark:text-gray-300' : 'text-red-600 dark:text-red-400'}">
		{on ? "Extensions on" : "Extensions off"}
	</span>
</div>
