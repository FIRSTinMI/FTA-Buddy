import { writable } from 'svelte/store';

// Define the initial state of the event store
const initialEvent = "";

// Create a writable store for the event
export const eventStore = writable(initialEvent);
