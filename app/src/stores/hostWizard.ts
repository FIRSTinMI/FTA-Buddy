import { writable } from "svelte/store";

export const hostWizardStore = writable({
	notepadOnly: false,
	useSignalR: false,
	fmsApiEnabled: true,
	teams: [] as number[],
});
