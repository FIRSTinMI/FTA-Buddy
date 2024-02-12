<script lang="ts">
  import { Button } from "flowbite-svelte";
  import { flashcardsStore } from "../stores/flashcards";
  import { get } from "svelte/store";

    let flashcards = get(flashcardsStore);
</script>

<div class="overlay flex flex-col justify-center items-center">
    <h1 class="text-3xl font-bold">Flashcards</h1>
    <p class="text-lg">Select a flashcard to view</p>
</div>

<div class="space-y-2 p-4">
    {#each flashcards as card}
        <div>
            <Button pill class="dark:bg-primary w-full">{card}</Button>
        </div>
    {/each}
</div>