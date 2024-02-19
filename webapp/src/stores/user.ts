import { writable } from "svelte/store";

export interface User {
    username: string;
    id: number;
    token: string;
}

let initialUser = localStorage.getItem('user');

if (!initialUser) {
    initialUser = JSON.stringify({
        username: '',
        id: 0,
        token: '',
    });
}

export const userStore = writable<User>(JSON.parse(initialUser));
userStore.subscribe((value: User) => {
    if (value === undefined) {
        value = {
            username: '',
            id: 0,
            token: '',
        };
    }
    localStorage.setItem('user', JSON.stringify(value));
});
