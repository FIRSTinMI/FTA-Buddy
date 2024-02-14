import { writable } from "svelte/store";

let initialNotes = localStorage.getItem('notes');

if (!initialNotes) {
    initialNotes = JSON.stringify({
        teams: [],
        lastTeam: '',
        username: '',
    });
}

export const notesStore = writable(JSON.parse(initialNotes));
notesStore.subscribe((value: string[]) => {
    localStorage.setItem('notes', JSON.stringify(value));
});
