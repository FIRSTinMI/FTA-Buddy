<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button } from "flowbite-svelte";
	import type { ChatQuestion } from "../../../../shared/troubleshooting/question";

	/**
	 * The assistant's multiple-choice question, as buttons.
	 *
	 * Typing on a phone with one hand while holding a robot is the slow part of a
	 * conversation, so the assistant narrows down with taps. The free-text box is
	 * not optional: the options are its guess at the shape of the problem, and the
	 * person at the robot gets to disagree.
	 */
	let {
		question,
		disabled = false,
		onanswer,
	}: { question: ChatQuestion; disabled?: boolean; onanswer: (text: string) => void } = $props();

	let other = $state("");
	let showOther = $state(false);
	let otherEl: HTMLInputElement | undefined = $state();

	function pick(label: string) {
		if (disabled) return;
		onanswer(label);
	}

	async function openOther() {
		showOther = true;
		// Focus after the box exists, so the keyboard comes up on a phone.
		await new Promise((r) => setTimeout(r, 0));
		otherEl?.focus();
	}

	function sendOther() {
		const text = other.trim();
		if (!text || disabled) return;
		other = "";
		showOther = false;
		onanswer(text);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			sendOther();
		}
	}
</script>

<div class="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 p-2 flex flex-col gap-1.5">
	<p class="text-sm font-semibold text-black dark:text-white">{question.question}</p>

	{#each question.options as option (option.label)}
		<button
			{disabled}
			onclick={() => pick(option.label)}
			class="w-full text-left rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
		>
			<span class="block text-black dark:text-white">{option.label}</span>
			{#if option.detail}
				<span class="block text-xs text-gray-500 dark:text-gray-400">{option.detail}</span>
			{/if}
		</button>
	{/each}

	{#if showOther}
		<div class="flex items-center gap-2">
			<input
				bind:this={otherEl}
				bind:value={other}
				onkeydown={onKeydown}
				{disabled}
				maxlength={400}
				placeholder={question.otherLabel}
				class="grow rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
			/>
			<Button size="sm" class="shrink-0" disabled={disabled || other.trim().length === 0} onclick={sendOther}>
				<Icon icon="heroicons:paper-airplane-16-solid" class="size-4" />
			</Button>
		</div>
	{:else}
		<button
			{disabled}
			onclick={openOther}
			class="w-full text-left rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
		>
			Something else
		</button>
	{/if}
</div>
