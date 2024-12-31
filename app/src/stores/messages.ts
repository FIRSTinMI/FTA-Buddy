import { writable } from "svelte/store";
import type { Profile } from "../../../shared/types";

export interface Message {
    id: number,
    ticket_id: number,
    match_id: string | null,
    text: string,
    author_id: number,
    author: Profile,
    created_at: Date,
    updated_at: Date,
}

let initialMessages = localStorage.getItem('messages');

if (!initialMessages) {
    initialMessages = JSON.stringify(null);
}

export const messagesStore = writable<Message>(JSON.parse(initialMessages));
messagesStore.subscribe((value: Message) => {
    if (value === undefined) {
        return;
    }
    localStorage.setItem('message', JSON.stringify(value));
});
