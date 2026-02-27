import { writable } from "svelte/store";

export interface User {
	email: string;
	username: string;
	id: number;
	token: string;
	eventToken: string;
	role: "FTA" | "FTAA" | "CSA" | "RI";
	admin: boolean;
	googleToken?: string;
	meshedEventToken?: string;
}

let initialUser = typeof window !== "undefined" && window.localStorage ? localStorage.getItem("user") : null;

if (!initialUser) {
	initialUser = JSON.stringify({
		email: "",
		username: "",
		id: 0,
		token: "",
		eventToken: "",
		role: "FTA",
		admin: false,
	});
}

const parsedInitialUser: User = JSON.parse(initialUser);
console.info(
	`[AUTH] userStore hydrated — token length: ${parsedInitialUser.token?.length ?? 0}, ` +
		`eventToken length: ${parsedInitialUser.eventToken?.length ?? 0}, ` +
		`origin: ${typeof window !== "undefined" ? window.location.origin : "SSR"}`,
);

export const userStore = writable<User>(parsedInitialUser);
userStore.subscribe((value: User) => {
	const userData = value ?? {
		email: "",
		username: "",
		id: 0,
		token: "",
		role: "FTA",
		admin: false,
		eventToken: "",
	};

	console.info(
		`[AUTH] userStore.set — token length: ${userData.token?.length ?? 0}, ` +
			`eventToken length: ${userData.eventToken?.length ?? 0}, ` +
			`user: ${userData.username || "(none)"}, ` +
			`path: ${typeof window !== "undefined" ? window.location.pathname : "SSR"}`,
	);

	if (typeof window !== "undefined" && window.localStorage) {
		localStorage.setItem("user", JSON.stringify(userData));
	}
});
