import { get, writable } from "svelte/store";
import { userStore } from "./user";

export type SupportBoardView = "feed" | "field";

const STORAGE_KEY = "supportBoardView";

function getDefaultView(): SupportBoardView {
	const user = get(userStore);
	if (user.role === "FTA" || user.role === "FTAA") return "field";
	return "feed";
}

let initial = typeof window !== "undefined" && window.localStorage ? localStorage.getItem(STORAGE_KEY) : null;

const initialValue: SupportBoardView = initial === "feed" || initial === "field" ? initial : getDefaultView();

export const supportBoardViewStore = writable<SupportBoardView>(initialValue);

supportBoardViewStore.subscribe((value) => {
	if (typeof window !== "undefined" && window.localStorage) {
		localStorage.setItem(STORAGE_KEY, value);
	}
});
