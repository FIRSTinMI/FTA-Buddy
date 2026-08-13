import { writable } from "svelte/store";

export const hostWizardStore = writable({
	notepadOnly: false,
	useSignalR: false,
	fmsApiEnabled: true,
	sourceMode: "fms" as "fms" | "cheesy",
	cheesyPort: 8080,
	teams: [] as number[],
});
