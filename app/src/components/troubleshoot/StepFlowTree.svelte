<script lang="ts">
	// Variant A, "Tree": the whole flow visible at once, laid out like the W3C alt decision tree.
	// A check step is a question band with a No column ("Continue" down the page) and a Yes column
	// holding the outcome. Do steps are plain numbered rows between the questions.
	import Icon from "@iconify/svelte";
	import { parseSteps, type FlowStep } from "../../../../shared/troubleshooting/steps";

	let { steps }: { steps: readonly (string | FlowStep)[] } = $props();

	let flow = $derived(parseSteps(steps));

	// Number only the do steps so the count matches what a person actually does.
	let numbered = $derived.by(() => {
		let n = 0;
		return flow.map((s) => (s.kind === "do" ? ++n : 0));
	});
</script>

<div class="flex flex-col text-left text-black dark:text-white">
	{#each flow as step, i (i)}
		{#if step.kind === "do"}
			<div class="flex gap-3 rounded-md border border-gray-300 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800">
				<span
					class="flex size-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-bold dark:bg-gray-700"
					>{numbered[i]}</span
				>
				<p class="leading-snug">{step.text}</p>
			</div>
		{:else}
			<div class="rounded-md border border-gray-300 dark:border-gray-600">
				<div class="flex items-start gap-2 bg-gray-100 px-3 py-3 font-bold dark:bg-gray-800">
					<Icon icon="heroicons:eye-16-solid" class="mt-0.5 size-5 shrink-0 text-gray-500" />
					<span>{step.text}</span>
				</div>
				<div class="grid grid-cols-[minmax(6rem,1fr)_2fr]">
					<div class="relative bg-rose-100 px-3 py-3 dark:bg-rose-950/60">
						<div class="font-bold">No:</div>
						<div class="text-sm">{step.no ?? "Continue."}</div>
						{#if i < flow.length - 1}
							<Icon
								icon="heroicons:arrow-down-16-solid"
								class="absolute -bottom-2 left-1/2 size-5 -translate-x-1/2 text-rose-400"
							/>
						{/if}
					</div>
					<div class="bg-sky-100 px-3 py-3 dark:bg-sky-950/60">
						<div class="font-bold">Yes:</div>
						<div class="text-sm">{step.yes ?? "Fixed."}</div>
					</div>
				</div>
			</div>
		{/if}
		{#if i < flow.length - 1}
			<div class="h-2"></div>
		{/if}
	{/each}
</div>
