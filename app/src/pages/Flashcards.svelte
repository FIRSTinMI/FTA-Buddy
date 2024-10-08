<script lang="ts">
    import { Button, Input, Label } from "flowbite-svelte";
    import { flashcardsStore } from "../stores/flashcards";
    import { get } from "svelte/store";

    let flashcards = get(flashcardsStore);
    let currentFlashcard = "";
    let addRemoveState = false;
    let newFlashcard = "";

    function openFlashcard(e: MouseEvent) {
        if (addRemoveState) {
            const target = e.target as HTMLButtonElement;
            const flashcard = target.textContent;
            flashcards = flashcards.filter((card) => card !== flashcard);
            flashcardsStore.set(flashcards);
            return;
        }

        const target = e.target as HTMLButtonElement;
        const flashcard = target.textContent;
        currentFlashcard = flashcard || "";
    }

    function dismissFlashcard() {
        currentFlashcard = "";
    }

    function switchToAddRemove() {
        addRemoveState = !addRemoveState;
    }

    function addNewFlashcard(evt: Event) {
        flashcards = [...flashcards, newFlashcard];
        flashcardsStore.set(flashcards);
        newFlashcard = "";
    }
</script>

{#key currentFlashcard}
    {#if currentFlashcard}
        <div class="overlay flex flex-col justify-center items-center bg-white dark:bg-neutral-900" on:click={dismissFlashcard} on:keydown={dismissFlashcard} role="presentation" id="flashcard-overlay">
            <h1 class="text-7xl font-bold mx-1 text-black dark:text-white">{currentFlashcard}</h1>
        </div>
    {/if}
{/key}

<div class="flex flex-col p-4 h-full">
    <div class="space-y-2 grow">
        {#each flashcards as card}
            <Button pill class="w-full {addRemoveState ? 'bg-red-500 dark:bg-red-500' : 'bg-primary-700 dark:bg-primary-500'}" size="lg" on:click={openFlashcard}>{card}</Button>
        {/each}
    </div>
    {#if addRemoveState}
        <p class="text-center mt-2">Click on a flashcard to remove it</p>
        <form on:submit|preventDefault={addNewFlashcard} class="flex w-full space-x-2 items-end mb-2">
            <Label class="grow">
                New Flashcard Text
                <Input bind:value={newFlashcard} />
            </Label>
            <Button pill class="h-10 my-1" type="submit">Add</Button>
        </form>
    {/if}
    <Button pill class="w-full mt-2" size="lg" on:click={switchToAddRemove}>
        {addRemoveState ? "Save" : "Add/Remove Flashcard"}
    </Button>
</div>
