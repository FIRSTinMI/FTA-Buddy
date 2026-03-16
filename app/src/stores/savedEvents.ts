import { writable } from "svelte/store";
import type { Profile, TeamList } from "../../../shared/types";

export interface SavedEvent {
	code: string;
	label?: string;
	token: string;
	pin: string;
	teams: { number: string; name: string; inspected: boolean }[];
	users: Profile[];
	subEvents?: { code: string; label: string; token: string; pin: string; teams: TeamList }[];
	meshedEventCode?: string;
}

const STORAGE_KEY = "savedEvents";

function loadFromStorage(): Record<string, SavedEvent> {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		return JSON.parse(raw) as Record<string, SavedEvent>;
	} catch {
		return {};
	}
}

export const savedEventsStore = writable<Record<string, SavedEvent>>(loadFromStorage());

savedEventsStore.subscribe((value) => {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
});

export function saveEvent(event: SavedEvent) {
	savedEventsStore.update((map) => {
		map[event.code] = event;
		return map;
	});
}
