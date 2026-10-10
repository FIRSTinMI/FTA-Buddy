<script lang="ts">
	// A team note with no request is saved as Resolved (a log entry), so the choice
	// is shown up front instead of as optional toggles under the text box.
	let { value = $bindable() }: { value: "CSA" | "RI" | null } = $props();

	const OPTIONS: { value: "CSA" | "RI" | null; label: string }[] = [
		{ value: null, label: "Log only" },
		{ value: "CSA", label: "Need CSA" },
		{ value: "RI", label: "Need RI" },
	];
</script>

<div
	class="rounded-lg border-2 p-3 text-sm {value
		? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
		: 'border-amber-400 bg-amber-50 dark:bg-amber-950'}"
>
	<p class="font-semibold text-gray-900 dark:text-white">Does the team need help?</p>
	<div class="grid grid-cols-3 gap-2 mt-2">
		{#each OPTIONS as opt}
			<button
				type="button"
				class="px-2 py-2 rounded-md border-2 font-medium transition-colors
					{value === opt.value
					? opt.value
						? 'border-blue-600 bg-blue-600 text-white'
						: 'border-amber-500 bg-amber-500 text-white'
					: 'border-gray-300 dark:border-gray-600 bg-white dark:bg-neutral-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-700'}"
				onclick={() => (value = opt.value)}
			>
				{opt.label}
			</button>
		{/each}
	</div>
	<p class="mt-2 text-xs {value ? 'text-blue-700 dark:text-blue-300' : 'text-amber-700 dark:text-amber-300'}">
		{value
			? "Stays open until someone resolves it."
			: "Saves as resolved. Pick CSA or RI to keep it open."}
	</p>
</div>
