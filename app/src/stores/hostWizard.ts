import { writable } from "svelte/store";

export const hostWizardStore = writable({
	notepadOnly: false,
	teams: [] as number[],
});
