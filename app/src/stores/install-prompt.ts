import { writable } from "svelte/store";

export const installPrompt = writable<BeforeInstallPromptEvent | null>(null);
