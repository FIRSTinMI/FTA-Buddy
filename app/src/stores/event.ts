import { writable } from 'svelte/store';

export interface Event {
    code: string;
    pin: string;
    teams: ({ number: string, name: string, inspected: boolean })[];
}

let initialEvent = localStorage.getItem('event');

if (!initialEvent) {
    initialEvent = JSON.stringify({
        code: '',
        pin: '',
        teams: []
    });
}

try {
    JSON.parse(initialEvent);
} catch (e) {
    initialEvent = JSON.stringify({
        code: '',
        pin: '',
        teams: []
    });
}

export const eventStore = writable<Event>(JSON.parse(initialEvent));
eventStore.subscribe((value) => {
    localStorage.setItem('event', JSON.stringify(value));
});
