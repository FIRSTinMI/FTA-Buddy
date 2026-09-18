import { writable } from "svelte/store";

export const hostWizardStore = writable({
	notepadOnly: false,
	useSignalR: true,
	fmsApiEnabled: true,
	scoreAutofill: false,
	sourceMode: "fms" as "fms" | "cheesy",
	cheesyPort: 8080,
	teams: [] as number[],
});
