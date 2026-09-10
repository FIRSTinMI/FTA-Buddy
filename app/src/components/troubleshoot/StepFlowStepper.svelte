<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button } from "flowbite-svelte";
	import { parseSteps, type FlowStep } from "../../../../shared/troubleshooting/steps";

	interface Props {
		steps: readonly (string | FlowStep)[];
		onFixed?: () => void;
	}

	let { steps, onFixed }: Props = $props();

	type Answer = "done" | "yes" | "no";

	let parsed = $derived(parseSteps(steps));
	// One entry per completed step, in order. The current step is parsed[answers.length].
	let answers: Answer[] = $state([]);
	let showAll = $state(false);

	// A new step list (for example the match state changed) restarts the flow.
	$effect(() => {
		parsed;
		answers = [];
	});

	let index = $derived(answers.length);
	let current = $derived(parsed[index]);
	// Only a check step can be answered "yes".
	let fixedStep = $derived.by(() => {
		const step = answers.at(-1) === "yes" ? parsed[index - 1] : undefined;
		return step?.kind === "check" ? step : undefined;
	});
	let outOfSteps = $derived(!fixedStep && index >= parsed.length);

	function answer(a: Answer) {
		answers = [...answers, a];
		if (a === "yes") onFixed?.();
	}

	function jumpTo(i: number) {
		answers = answers.slice(0, i);
	}

	function startOver() {
		answers = [];
	}

	function lineLabel(step: FlowStep, a: Answer): string {
		return step.kind === "check" ? (a === "yes" ? "Yes" : "No") : "";
	}
</script>

<div class="flex w-full max-w-md flex-col gap-2 text-left text-black dark:text-white">
	<!-- #region Mode toggle -->
	<button
		type="button"
		onclick={() => (showAll = !showAll)}
		class="flex min-h-12 items-center gap-1 self-end text-sm text-gray-600 hover:text-black dark:text-gray-300 dark:hover:text-white"
	>
		<Icon icon={showAll ? "heroicons:rectangle-stack-16-solid" : "heroicons:list-bullet-16-solid"} class="size-4" />
		{showAll ? "Step by step" : "Show all steps"}
	</button>
	<!-- #endregion -->

	{#if showAll}
		<!-- #region Read-only list -->
		<ol class="flex list-decimal flex-col gap-2 pl-6">
			{#each parsed as step, i (i)}
				<li class="pl-1">
					{#if step.kind === "check"}
						<span class="font-semibold">Check:</span>
						{step.text}
						<span class="font-semibold">Yes:</span>
						{step.yes ?? "Fixed."}
					{:else}
						{step.text}
					{/if}
				</li>
			{/each}
		</ol>
		<!-- #endregion -->
	{:else}
		<!-- #region Completed steps -->
		{#if answers.length > 0}
			<ol class="flex flex-col gap-1">
				{#each answers as a, i (i)}
					{@const step = parsed[i]}
					<li>
						<button
							type="button"
							onclick={() => jumpTo(i)}
							class="flex min-h-12 w-full items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"
						>
							{#if step.kind === "check"}
								<span
									class="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold {a === 'yes'
										? 'bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-100'
										: 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-100'}"
								>
									{lineLabel(step, a)}
								</span>
							{:else}
								<Icon
									icon="heroicons:check-16-solid"
									class="size-4 shrink-0 text-green-600 dark:text-green-400"
								/>
							{/if}
							<span class="min-w-0 truncate">{step.text}</span>
						</button>
					</li>
				{/each}
			</ol>
		{/if}
		<!-- #endregion -->

		<!-- #region Current card -->
		{#if fixedStep}
			<div class="rounded-lg border border-green-500 bg-green-50 p-4 dark:bg-green-950">
				<p class="text-lg font-bold text-green-800 dark:text-green-200">{fixedStep.yes ?? "Fixed."}</p>
				<button type="button" onclick={startOver} class="mt-3 min-h-12 text-sm underline">Start over</button>
			</div>
		{:else if outOfSteps}
			<div class="rounded-lg border border-gray-400 bg-gray-100 p-4 dark:border-gray-600 dark:bg-gray-800">
				<p class="text-lg font-bold">None of that fixed it.</p>
				<button type="button" onclick={startOver} class="mt-3 min-h-12 text-sm underline">Start over</button>
			</div>
		{:else if current}
			<div class="rounded-lg border border-gray-300 bg-white p-4 dark:border-gray-600 dark:bg-gray-900">
				<p class="text-xs text-gray-500 dark:text-gray-400">Step {index + 1} of {parsed.length}</p>
				<p class="mt-1 text-lg font-semibold">{current.text}</p>
				{#if current.kind === "check"}
					<div class="mt-4 grid grid-cols-2 gap-2">
						<Button color="green" class="min-h-12 text-base" onclick={() => answer("yes")}>Yes</Button>
						<Button outline class="min-h-12 text-base" onclick={() => answer("no")}>No</Button>
					</div>
				{:else}
					<Button class="mt-4 min-h-12 w-full text-base" onclick={() => answer("done")}>Done, next</Button>
				{/if}
			</div>
		{/if}
		<!-- #endregion -->
	{/if}
</div>
