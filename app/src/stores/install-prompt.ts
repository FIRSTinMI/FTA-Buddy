import { writable } from "svelte/store";

interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const installPrompt = writable<BeforeInstallPromptEvent | null>(null);
