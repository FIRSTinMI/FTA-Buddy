import { writable } from "svelte/store";

export interface User {
    username: string;
    id: number;
    token: string;
    role: string;
    admin: boolean;
}

let initialUser = localStorage.getItem('user');

if (!initialUser) {
    initialUser = JSON.stringify({
        username: '',
        id: 0,
        token: '',
        role: 'FTA',
        admin: false
    });
}
export const userStore = writable<User>(JSON.parse(initialUser));
userStore.subscribe((value: User) => {
    const userData = value ?? {
        username: '',
        id: 0,
        token: '',
        role: 'FTA',
        admin: false
    };

    localStorage.setItem('user', JSON.stringify(userData));
});