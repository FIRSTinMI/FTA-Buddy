import { writable } from "svelte/store";

export interface Auth {
    token: string;
    eventToken: string;
    user?: {
        username: string;
        email: string;
        role: string;
        id: number;
    }
    googleToken?: string;
}

let initialAuth = localStorage.getItem('auth');

if (!initialAuth) {
    initialAuth = JSON.stringify({
        token: '',
        eventToken: '',
        user: undefined
    });
}

export const authStore = writable<Auth>(JSON.parse(initialAuth));
authStore.subscribe((value: Auth) => {
    localStorage.setItem('auth', JSON.stringify(value));
});
