/**
 * One-time script to normalize team numbers in the events table.
 * The `teams[].number` field and checklist keys should always be strings,
 * but a bug in addTeams caused some events to store them as JSON numbers.
 *
 * Run with: bun run normalize-teams
 */

import "dotenv/config";
import { eq } from "drizzle-orm";
import { connect, db } from "./db";
import { events } from "./schema";
import type { TeamList, EventChecklist } from "../../shared/types";

async function normalize() {
	await connect();

	const allEvents = await db.select({ code: events.code, teams: events.teams, checklist: events.checklist }).from(events);

	let fixed = 0;

	for (const event of allEvents) {
		const teams = (event.teams ?? []) as TeamList;
		const checklist = (event.checklist ?? {}) as EventChecklist;

		const hasNumericTeam = teams.some((t) => typeof t.number !== "string");
		const hasNumericChecklistKey = Object.keys(checklist).some((k) => typeof k !== "string");

		if (!hasNumericTeam && !hasNumericChecklistKey) continue;

		const normalizedTeams: TeamList = teams.map((t) => ({ ...t, number: String(t.number) }));

		// Rebuild checklist with string keys (handles the case where keys were stored as numbers)
		const normalizedChecklist: EventChecklist = {};
		for (const [key, value] of Object.entries(checklist)) {
			normalizedChecklist[String(key)] = value;
		}

		await db.update(events).set({ teams: normalizedTeams, checklist: normalizedChecklist }).where(eq(events.code, event.code));

		console.log(`Fixed event ${event.code}`);
		fixed++;
	}

	console.log(`Done. Fixed ${fixed} event(s).`);
	process.exit(0);
}

normalize().catch((err) => {
	console.error("Normalization failed:", err);
	process.exit(1);
});
