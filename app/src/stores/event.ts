import { writable } from 'svelte/store';

// Define the initial state of the event store
const initialEvent = localStorage.getItem('event') || "";
const initialRelay = (localStorage.getItem('relay') == "true");

// Create a writable store for the event
export const eventStore = writable(initialEvent);
eventStore.subscribe((value) => {
    if (value === undefined) {
        value = "";
    }
    localStorage.setItem('event', value);
});

export const relayStore = writable(initialRelay);
relayStore.subscribe((value) => {
    localStorage.setItem('relay', value.toString());
});
