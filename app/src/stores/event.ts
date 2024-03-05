import { writable } from 'svelte/store';

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

export const eventStore = writable(JSON.parse(initialEvent));
eventStore.subscribe((value) => {
    localStorage.setItem('event', JSON.stringify(value));
});
