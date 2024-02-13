<script lang="ts">
    import { Button } from "flowbite-svelte";
    import { flashcardsStore } from "../stores/flashcards";
    import { get } from "svelte/store";

    let flashcards = get(flashcardsStore);
    let currentFlashcard = "";

    function openFlashcard(e: MouseEvent) {
        const target = e.target as HTMLButtonElement;
        const flashcard = target.textContent;
        currentFlashcard = flashcard || "";
    }

    function dismissFlashcard() {
        currentFlashcard = "";
    }
</script>

{#key currentFlashcard}
    {#if currentFlashcard}
        <div class="overlay flex flex-col justify-center items-center" on:click={dismissFlashcard} on:keydown={dismissFlashcard} role="presentation" id="flashcard-overlay">
            <h1 class="text-3xl font-bold">{currentFlashcard}</h1>
        </div>
    {/if}
{/key}

<div class="space-y-2 p-4">
    {#each flashcards as card}
        <div>
            <Button pill class="dark:bg-primary w-full" size="lg" on:click={openFlashcard}>{card}</Button>
        </div>
    {/each}
</div>