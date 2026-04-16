import { get } from "svelte/store";
import { trpc, trpcWithEventToken } from "../main";
import { eventStore } from "../stores/event";
import { userStore } from "../stores/user";

/**
 * Returns the tRPC client that should be used when creating a note for the given team.
 *
 * In combined meshed-event view (meshedEventToken === eventToken and not in playoff mode)
 * notes must be saved under the team's sub-event, not the parent meshed event.
 * In inter-divisional playoffs mode the meshed event is the correct target, so the
 * default trpc client (which already carries the meshed-event token) is returned.
 */
export function trpcForTeam(teamNumber: number): ReturnType<typeof trpcWithEventToken> | typeof trpc {
	const user = get(userStore);
	const event = get(eventStore);

	const isCombinedView =
		!!user.meshedEventToken &&
		user.meshedEventToken === user.eventToken &&
		!!event.subEvents?.length &&
		!event.playoffMode;

	if (!isCombinedView) return trpc;

	const subEvent = event.subEvents!.find((se) => se.teams.some((t) => String(t.number) === String(teamNumber)));

	if (!subEvent) return trpc;

	return trpcWithEventToken(subEvent.token);
}
