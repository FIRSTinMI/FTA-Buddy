import { writable } from "svelte/store";

export interface Message {
    id: number;
    message: string;
    created_at: Date;
    user_id: number;
    team: string;
    event_code: string;
    username: string;
    thread_id: number;
}

export interface Ticket extends Message {
    is_ticket: true;
    is_open: boolean;
    assigned_to: [];
    closed_at?: Date;
}

export interface Notes {
    messages: { [key: string]: Message[] };
    tickets: Ticket[];
    unread: number;
}

let initialMessages = localStorage.getItem('messages');

if (!initialMessages) {
    initialMessages = JSON.stringify({
        messages: {},
        tickets: [],
        unread: 0,
    });
}

export const messagesStore = writable<Notes>(JSON.parse(initialMessages));
messagesStore.subscribe((value: Notes) => {
    if (value === undefined) {
        value = {
            messages: {},
            tickets: [],
            unread: 0,
        };
    }
    localStorage.setItem('notes', JSON.stringify(value));
});
