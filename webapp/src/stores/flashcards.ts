import { writable } from "svelte/store";

let initialFlashcards = localStorage.getItem('flashcards');

const defaultFlashcards: string[] = [
    'Plug in Ethernet',
    'Turn on Robot',
    'Come here',
    'Switch driver stations',
    'Preload?'
];

if (!initialFlashcards) {
    initialFlashcards = JSON.stringify(defaultFlashcards);
}

export const flashcardsStore = writable<string[]>(JSON.parse(initialFlashcards));
flashcardsStore.subscribe((value: string[]) => {
    if (value === undefined) {
        value = defaultFlashcards;
    }
    localStorage.setItem('flashcards', JSON.stringify(value));
});
