import { get } from "svelte/store";
import { eventStore } from "../stores/event";

export function displayTeam(teamNumber: number | string): string {
    const event = get(eventStore);
    if (event && event.teams) {
        const team = event.teams.find((t) => t.number === teamNumber);
        if (team) {
            return `#${team.number} - ${team.name}`;
        }
    }
    return `#${teamNumber}`;
}
