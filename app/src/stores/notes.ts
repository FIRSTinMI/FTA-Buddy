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
    unread: number;
}

let initialNotes = localStorage.getItem('notes');

if (!initialNotes) {
    initialNotes = JSON.stringify({
        teams: [],
        lastTeam: '',
        notes: {},
        unread: 0,
    });
}

export const notesStore = writable<Notes>(JSON.parse(initialNotes));
notesStore.subscribe((value: Notes) => {
    if (value === undefined) {
        value = {
            teams: [],
            lastTeam: '',
            notes: {},
            unread: 0,
        };
    }
    localStorage.setItem('notes', JSON.stringify(value));
});
