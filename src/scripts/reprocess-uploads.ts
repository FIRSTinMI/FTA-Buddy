// Re-run the importer over uploads that are already stored, named by their code:
//
//   bun run src/scripts/reprocess-uploads.ts SPXM-B65J 5AV3-NWNC
//   bun run src/scripts/reprocess-uploads.ts --event 2026mibr
//
// For when a parser is fixed after the fact and the rows it wrote are wrong.
// Needs the same env as the server (DB_*, and the bucket, since it reads the
// stored bytes back). Safe to run again: everything it writes is derived from
// the files, so a second pass produces the same answer.
import "dotenv/config";
import { eq } from "drizzle-orm";
import { connect, db } from "../db/db";
import { teamUploads } from "../db/schema";
import { reprocessUpload } from "../util/uploads/ingest";

async function main() {
	const args = process.argv.slice(2);
	const eventFlag = args.indexOf("--event");
	const codes = eventFlag === -1 ? args : [];
	const eventCode = eventFlag === -1 ? null : args[eventFlag + 1];

	if (codes.length === 0 && !eventCode) {
		console.error("Give upload codes, or --event <code>.");
		process.exit(1);
	}

	await connect();

	const rows = eventCode
		? await db
				.select({ id: teamUploads.id, code: teamUploads.code })
				.from(teamUploads)
				.where(eq(teamUploads.event, eventCode))
				.execute()
		: await Promise.all(
				codes.map(async (code) => {
					const row = await db.query.teamUploads.findFirst({ where: eq(teamUploads.code, code) });
					if (!row) throw new Error(`No upload with code ${code}`);
					return { id: row.id, code: row.code };
				}),
			);

	if (rows.length === 0) {
		console.log("Nothing to do.");
		process.exit(0);
	}

	for (const row of rows) {
		const result = await reprocessUpload(row.id);
		console.log(
			`${row.code}: ${result.files} file(s) re-read, team ${result.team ? `${result.team.team} (${result.team.source})` : "still unknown"}, log date ${result.logDate?.toISOString() ?? "unknown"}, ${result.links} match link(s)`,
		);
	}
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
