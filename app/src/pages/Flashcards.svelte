<script lang="ts">
	import { Button, Input, Label } from "flowbite-svelte";
	import { flashcardsStore } from "../stores/flashcards";
	import { track } from "../util/telemetry";

	track("flashcards_viewed");

	let currentFlashcard = $state("");
	let addRemoveState = $state(false);
	let newFlashcard = $state("");

	function openFlashcard(card: string) {
		if (addRemoveState) {
			flashcardsStore.update((cards) => cards.filter((c) => c !== card));
			return;
		}

		currentFlashcard = card;
	}

	function dismissFlashcard() {
		currentFlashcard = "";
	}

	function switchToAddRemove() {
		addRemoveState = !addRemoveState;
	}

	function addNewFlashcard(evt: Event) {
		evt.preventDefault();
		if (!newFlashcard.trim()) return;

		flashcardsStore.update((cards) => [...cards, newFlashcard.trim()]);
		newFlashcard = "";
	}
</script>

{#key currentFlashcard}
	{#if currentFlashcard}
		<div
			class="overlay flex flex-col justify-center items-center bg-white dark:bg-neutral-900"
			onclick={dismissFlashcard}
			onkeydown={dismissFlashcard}
			role="presentation"
			id="flashcard-overlay"
		>
			<h1 class="text-7xl font-bold mx-1 text-black dark:text-white">{currentFlashcard}</h1>
		</div>
	{/if}
{/key}

<div class="flex flex-col p-4 h-full">
	<div class="space-y-2 grow">
		{#each $flashcardsStore as card}
			<Button
				pill
				class="w-full {addRemoveState ? 'bg-red-500 dark:bg-red-500' : 'bg-primary-700 dark:bg-primary-500'}"
				size="lg"
				onclick={() => openFlashcard(card)}>{card}</Button
			>
		{/each}
	</div>
	{#if addRemoveState}
		<p class="text-center mt-2">Click on a flashcard to remove it</p>
		<form onsubmit={addNewFlashcard} class="flex w-full space-x-2 items-end mb-2">
			<Label class="grow">
				New Flashcard Text
				<Input bind:value={newFlashcard} />
			</Label>
			<Button pill class="h-10 my-1" type="submit">Add</Button>
		</form>
	{/if}
	<Button pill class="w-full mt-2" size="lg" onclick={switchToAddRemove}>
		{addRemoveState ? "Save" : "Add/Remove Flashcard"}
	</Button>
</div>
