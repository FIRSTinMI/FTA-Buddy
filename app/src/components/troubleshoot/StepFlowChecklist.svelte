<script lang="ts">
	// Variant C, "Checklist": every step visible, tick them off as you go. Do steps have a checkbox.
	// Check steps are a question with inline Yes / No; Yes reveals the outcome in green and stops
	// the list there, No greys the question out and moves on.
	import Icon from "@iconify/svelte";
	import { parseSteps, type FlowStep } from "../../../../shared/troubleshooting/steps";

	let { steps }: { steps: readonly (string | FlowStep)[] } = $props();

	let flow = $derived(parseSteps(steps));
	let done = $state<Record<number, boolean>>({});
	let answers = $state<Record<number, "yes" | "no">>({});

	// First check answered "yes" ends the flow; everything after it is dimmed.
	let fixedAt = $derived.by(() => {
		for (let i = 0; i < flow.length; i++) {
			const step = flow[i];
			if (step.kind !== "check") continue;
			if (answers[i] === "yes" && !step.yes) return i;
			if (answers[i] === "no" && step.no) return i;
		}
		return -1;
	});

	function reset() {
		done = {};
		answers = {};
	}
</script>

<div class="flex flex-col gap-2 text-left text-black dark:text-white">
	{#each flow as step, i (i)}
		{@const after = fixedAt >= 0 && i > fixedAt}
		{#if step.kind === "do"}
			<label
				class={"flex min-h-12 cursor-pointer items-start gap-3 rounded-md border px-3 py-2 " +
					(done[i]
						? "border-green-500 bg-green-50 dark:bg-green-950/40"
						: "border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800") +
					(after ? " opacity-40" : "")}
			>
				<input type="checkbox" class="mt-1 size-5 shrink-0 accent-green-600" bind:checked={done[i]} disabled={after} />
				<span class="leading-snug" class:line-through={done[i]}>{step.text}</span>
			</label>
		{:else}
			<div
				class={"rounded-md border px-3 py-2 " +
					(answers[i] === "yes"
						? "border-green-500 bg-green-50 dark:bg-green-950/40"
						: answers[i] === "no"
							? "border-gray-300 bg-gray-50 opacity-60 dark:border-gray-600 dark:bg-gray-800"
							: "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30") +
					(after ? " opacity-40" : "")}
			>
				<div class="flex items-start gap-2">
					<Icon icon="heroicons:eye-16-solid" class="mt-1 size-5 shrink-0 text-amber-600" />
					<span class="font-semibold leading-snug">{step.text}</span>
				</div>
				<div class="mt-2 flex gap-2">
					<button
						type="button"
						class={"min-h-10 flex-1 rounded-md border px-3 font-semibold " +
							(answers[i] === "yes" ? "border-gray-500 bg-gray-500 text-white" : "border-gray-400 text-gray-700 dark:text-gray-300")}
						disabled={after}
						onclick={() => (answers[i] = "yes")}>Yes</button
					>
					<button
						type="button"
						class={"min-h-10 flex-1 rounded-md border px-3 font-semibold " +
							(answers[i] === "no" ? "border-gray-500 bg-gray-500 text-white" : "border-gray-400 text-gray-700 dark:text-gray-300")}
						disabled={after}
						onclick={() => (answers[i] = "no")}>No</button
					>
				</div>
				{#if answers[i] === "yes"}
					<p class="mt-2 font-semibold" class:text-green-700={!step.yes} class:dark:text-green-400={!step.yes}>
						{step.yes ?? "Fixed."}
					</p>
				{:else if answers[i] === "no"}
					<p class="mt-2 font-semibold" class:text-green-700={!!step.no} class:dark:text-green-400={!!step.no}>
						{step.no ?? "Continue."}
					</p>
				{/if}
			</div>
		{/if}
	{/each}
	{#if Object.keys(done).length > 0 || Object.keys(answers).length > 0}
		<button type="button" class="self-start text-sm underline" onclick={reset}>Start over</button>
	{/if}
</div>
