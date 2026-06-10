import { eq } from "drizzle-orm";
import type { Profile } from "../../shared/types";
import { db } from "../db/db";
import { users } from "../db/schema";

/**
 * Placeholder users that satisfy the `author_id` FK when a note/message has no
 * signed-in author (field-level edits, anonymous public submissions). Reserved
 * negative IDs - the serial sequence only produces positives. Upserted on first
 * call and cached per-process.
 */

const COLS = { id: true, username: true, role: true, admin: true } as const;

let fieldPromise: Promise<Profile> | null = null;
let publicPromise: Promise<Profile> | null = null;

async function bootstrap(id: number, username: string, email: string): Promise<Profile> {
	const existing = await db.query.users.findFirst({ columns: COLS, where: eq(users.id, id) });
	if (existing) return existing;
	await db.insert(users).values({ id, username, email, role: "System", admin: false }).onConflictDoNothing();
	return { id, username, role: "System", admin: false };
}

export function getFieldProfile() {
	return (fieldPromise ??= bootstrap(-1, "Field", "field@fta-buddy.invalid"));
}

export function getPublicProfile() {
	return (publicPromise ??= bootstrap(-2, "Public", "public@fta-buddy.invalid"));
}

/** Project a wide users row down to the Profile shape stored in `author` JSONB. */
export function toProfile(u: { id: number; username: string; role: Profile["role"]; admin: boolean }): Profile {
	return { id: u.id, username: u.username, role: u.role, admin: u.admin };
}
