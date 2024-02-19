import { writable } from "svelte/store";

interface Message {
    id: number;
    profile: number;
    event: string;
    team: number;
    message: string;
    created: Date;
    username: string;
}

export interface Notes {
    teams: string[];
    lastTeam: string;
    notes: { [key: string]: Message[] };
}

let initialNotes = localStorage.getItem('notes');

if (!initialNotes) {
    initialNotes = JSON.stringify({
        teams: [],
        lastTeam: '',
        notes: {},
    });
}

export const notesStore = writable<Notes>(JSON.parse(initialNotes));
notesStore.subscribe((value: Notes) => {
    localStorage.setItem('notes', JSON.stringify(value));
});
