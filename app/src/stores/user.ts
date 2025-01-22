import { writable } from "svelte/store";

export interface User {
    email: string,
    username: string;
    id: number;
    token: string;
    eventToken: string;
    role: "FTA" | "FTAA" | "CSA" | "RI";
    admin: boolean;
    googleToken?: string;
}

let initialUser = typeof window !== 'undefined' && window.localStorage ? localStorage.getItem('user') : null;

if (!initialUser) {
    initialUser = JSON.stringify({
        email: "",
        username: '',
        id: 0,
        token: '',
        eventToken: '',
        role: 'FTA',
        admin: false,
    });
}
export const userStore = writable<User>(JSON.parse(initialUser));
userStore.subscribe((value: User) => {
    const userData = value ?? {
        email: "",
        username: '',
        id: 0,
        token: '',
        role: 'FTA',
        admin: false,
        eventToken: '',
    };

    if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('user', JSON.stringify(userData));
    }
});