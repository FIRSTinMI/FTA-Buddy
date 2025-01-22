import { writable } from "svelte/store";
import type { Profile, Message } from "../../../shared/types";

export interface Ticket {
    id: number,
    team: number,
    subject: string,
    author_id: number,
    author: Profile,
    assigned_to_id: number,
    assigned_to?: Profile | null,
    event_code: string,
    is_open: boolean,
    text: string,
    created_at: Date,
    updated_at: Date,
    closed_at?: Date | null,
    messages: Message[] | null,
    matchId?: string,
    followers: number[] | null,
}

let initialTickets = localStorage.getItem('tickets');

if (!initialTickets) {
    initialTickets = JSON.stringify(null);
}

export const messagesStore = writable<Ticket>(JSON.parse(initialTickets));
messagesStore.subscribe((value: Ticket) => {
    if (value === undefined) {
        return;
    }
    localStorage.setItem('ticket', JSON.stringify(value));
});
