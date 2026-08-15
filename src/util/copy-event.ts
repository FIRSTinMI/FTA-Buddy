import { prodPool, devPool } from "./prod-db";

/**
 * Dev-only: copy a whole event graph from PRODUCTION into this (dev) instance.
 * Reads prod read-only; writes dev only. All user references are remapped to the
 * dev user who triggered the copy, so notes/messages/lineups keep their content
 * (original author name is preserved in the *_display_name / *_name columns) while
 * foreign keys stay valid inside the isolated dev auth world.
 */

// node-pg returns jsonb as objects and bytea as Buffers; re-encode for insert.
function serialize(v: unknown): unknown {
	if (v === null || v === undefined) return null;
	if (Buffer.isBuffer(v)) return v; // bytea
	if (v instanceof Date) return v; // timestamp
	if (typeof v === "object") return JSON.stringify(v); // jsonb / array
	return v;
}

async function copyRows(
	table: string,
	selectSql: string,
	params: unknown[],
	opts: { overrides?: Record<string, unknown>; conflict?: string } = {},
): Promise<number> {
	const { rows } = await prodPool().query(selectSql, params);
	if (rows.length === 0) return 0;
	const client = await devPool().connect();
	try {
		for (const row of rows) {
			const merged: Record<string, unknown> = { ...row, ...(opts.overrides ?? {}) };
			const cols = Object.keys(merged);
			const placeholders = cols.map((_, i) => `$${i + 1}`);
			const values = cols.map((c) => serialize(merged[c]));
			const sql =
				`insert into "${table}" (${cols.map((c) => `"${c}"`).join(",")}) ` +
				`values (${placeholders.join(",")}) ${opts.conflict ?? ""}`;
			await client.query(sql, values);
		}
	} finally {
		client.release();
	}
	return rows.length;
}

export async function copyEventFromProd(
	code: string,
	devUserId: number,
): Promise<{ code: string; counts: Record<string, number> }> {
	// 1. Clean any prior copy of this event in dev (FK-safe order).
	const dc = await devPool().connect();
	try {
		await dc.query("begin");
		const cleanup = [
			`delete from messages where event_code=$1`,
			`delete from note_followers where note_id in (select id from notes where event_code=$1)`,
			`delete from match_events where event_code=$1`,
			`delete from notes where event_code=$1`,
			`delete from analyzed_logs where event=$1`,
			`delete from field_lineups where event_code=$1`,
			`delete from lineup_cards where event_code=$1`,
			`delete from playoff_alliances where event_code=$1`,
			`delete from team_cycle_logs where event=$1`,
			`delete from cycle_logs where event=$1`,
			`delete from log_publishing where event=$1`,
			`delete from checklist where event_code=$1`,
			`delete from ai_event_reports where event_code=$1`,
			`delete from match_logs where event=$1`,
			`delete from event_users where event_code=$1`,
			`delete from events where code=$1`,
		];
		for (const stmt of cleanup) await dc.query(stmt, [code]);
		await dc.query("commit");
	} catch (e) {
		await dc.query("rollback").catch(() => {});
		dc.release();
		throw e;
	}
	dc.release();

	const counts: Record<string, number> = {};
	// 2. Parents first, then children (FK-safe).
	counts.events = await copyRows("events", `select * from events where code=$1`, [code]);
	counts.teams = await copyRows(
		"teams",
		`select distinct t.* from teams t join checklist c on c.team_number=t.number where c.event_code=$1`,
		[code],
		{ conflict: `on conflict (number) do nothing` },
	);
	counts.checklist = await copyRows("checklist", `select * from checklist where event_code=$1`, [code]);
	counts.match_logs = await copyRows("match_logs", `select * from match_logs where event=$1`, [code]);
	counts.analyzed_logs = await copyRows("analyzed_logs", `select * from analyzed_logs where event=$1`, [code]);
	counts.cycle_logs = await copyRows("cycle_logs", `select * from cycle_logs where event=$1`, [code]);
	counts.team_cycle_logs = await copyRows("team_cycle_logs", `select * from team_cycle_logs where event=$1`, [code]);
	counts.log_publishing = await copyRows("log_publishing", `select * from log_publishing where event=$1`, [code]);
	counts.notes = await copyRows("notes", `select * from notes where event_code=$1`, [code], {
		overrides: { author_id: devUserId, assigned_to_id: null, resolved_by_id: null },
	});
	counts.messages = await copyRows("messages", `select * from messages where event_code=$1`, [code], {
		overrides: { author_id: devUserId },
	});
	counts.match_events = await copyRows("match_events", `select * from match_events where event_code=$1`, [code]);
	counts.field_lineups = await copyRows("field_lineups", `select * from field_lineups where event_code=$1`, [code], {
		overrides: { updated_by_id: devUserId },
	});
	counts.playoff_alliances = await copyRows(
		"playoff_alliances",
		`select * from playoff_alliances where event_code=$1`,
		[code],
	);
	counts.lineup_cards = await copyRows("lineup_cards", `select * from lineup_cards where event_code=$1`, [code], {
		overrides: { submitted_by_id: devUserId, accepted_anyway_by_id: null },
	});

	// 3. Attach the triggering dev user and make it their active event.
	const client = await devPool().connect();
	try {
		await client.query(`insert into event_users(user_id,event_code) values ($1,$2) on conflict do nothing`, [
			devUserId,
			code,
		]);
		await client.query(`update users set active_event_code=$2 where id=$1`, [devUserId, code]);
	} finally {
		client.release();
	}

	return { code, counts };
}
