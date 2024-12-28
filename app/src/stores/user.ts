import { writable } from "svelte/store";

export interface User {
    email: string,
    username: string;
    id: number;
    token: string;
    eventToken: string;
    role: string;
    admin: boolean;
    googleToken?: string;
}

let initialUser = localStorage.getItem('user');

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

    localStorage.setItem('user', JSON.stringify(userData));
});