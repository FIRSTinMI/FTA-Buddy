import { writable } from "svelte/store";

let initialFlashcards = localStorage.getItem('flashcards');

if (!initialFlashcards) {
    initialFlashcards = JSON.stringify([
        'Plug in Ethernet',
        'Turn on Robot',
        'Come here',
        'Switch driver stations',
        'Preload?'
    ]);
}

export const flashcardsStore = writable<string[]>(JSON.parse(initialFlashcards));
flashcardsStore.subscribe((value: string[]) => {
    localStorage.setItem('flashcards', JSON.stringify(value));
});
