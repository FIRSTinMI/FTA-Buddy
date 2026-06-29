import { writable } from "svelte/store";

export const hostWizardStore = writable({
	notepadOnly: false,
	useSignalR: false,
	fmsApiEnabled: true,
	sourceMode: "fms" as "fms" | "cheesy",
	cheesyHost: "10.0.100.5:8080",
	teams: [] as number[],
});
