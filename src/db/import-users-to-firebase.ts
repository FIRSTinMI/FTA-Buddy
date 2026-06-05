/**
 * One-time migration: import existing email/password users into Firebase Auth,
 * preserving their bcrypt password hashes (no forced reset), and backfill
 * `users.firebase_uid` so they resolve immediately on first sign-in.
 *
 * Google-only users (password === "google") are intentionally skipped: with the
 * project's "link accounts with the same email" setting, they self-provision on
 * their first Google sign-in and `resolveUserFromToken` links them by email.
 *
 * Usage:
 *   # Against the local emulator (safe dry-run-ish test):
 *   FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 bun run src/db/import-users-to-firebase.ts
 *
 *   # Against production (real Firebase). Do NOT set the emulator host.
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     bun run src/db/import-users-to-firebase.ts
 *
 * Idempotent: importUsers upserts by uid, and the uid is derived from the row id.
 *
 * NOTE: The Firebase Auth *emulator* accepts the import but cannot verify
 * imported bcrypt hashes on sign-in (a known emulator limitation). The import +
 * original-password sign-in has been validated against the REAL Firebase
 * project, which works correctly. Validate against real Firebase, not the
 * emulator, before the production cutover.
 */
import "dotenv/config";
import { isNotNull } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { connect, db } from "../db/db";
import { users } from "../db/schema";
import { adminAuth } from "../util/firebase-admin";

const BATCH = 1000;
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
	await connect();

	// Select only columns that exist pre-migration so --dry-run works before
	// firebase_uid has been added.
	const all = await db
		.select({ id: users.id, email: users.email, password: users.password })
		.from(users)
		.where(isNotNull(users.email));

	const bcryptUsers = all.filter((u) => typeof u.password === "string" && u.password.startsWith("$2"));
	const googleOnly = all.filter((u) => u.password === "google");
	const skipped = all.length - bcryptUsers.length - googleOnly.length;

	console.log(
		`Found ${all.length} users: ${bcryptUsers.length} with bcrypt passwords, ` +
			`${googleOnly.length} Google-only (self-provision on first login), ${skipped} other/skipped.`,
	);

	if (DRY_RUN) {
		console.log("\n--dry-run: would import these bcrypt users (no Firebase or DB writes):");
		for (const u of bcryptUsers) console.log(`  pg-${u.id}  ${u.email}`);
		process.exit(0);
	}

	let imported = 0;
	let failed = 0;

	for (let i = 0; i < bcryptUsers.length; i += BATCH) {
		const chunk = bcryptUsers.slice(i, i + BATCH);
		const records = chunk.map((u) => ({
			uid: `pg-${u.id}`,
			email: u.email,
			emailVerified: true,
			passwordHash: Buffer.from(u.password as string),
		}));

		const result = await adminAuth.importUsers(records, { hash: { algorithm: "BCRYPT" } });
		imported += result.successCount;
		failed += result.failureCount;

		for (const err of result.errors) {
			console.error(`  import failed for ${chunk[err.index].email}: ${err.error.message}`);
		}

		// Backfill firebase_uid for the rows that imported cleanly.
		const failedIdx = new Set(result.errors.map((e) => e.index));
		await Promise.all(
			chunk
				.filter((_, idx) => !failedIdx.has(idx))
				.map((u) => db.update(users).set({ firebase_uid: `pg-${u.id}` }).where(eq(users.id, u.id))),
		);

		console.log(`  batch ${i / BATCH + 1}: ${result.successCount} imported, ${result.failureCount} failed`);
	}

	console.log(`Done. Imported ${imported} users, ${failed} failures. Google-only users were left to self-provision.`);
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error("Import failed:", err);
	process.exit(1);
});
