import { and, eq } from "drizzle-orm";
import { KIND_LABELS } from "../../../../shared/logs/detect";
import { readDsEvents, readDsLog, type DsLogResult } from "../../../../shared/logs/dslog";
import { readCsvTelemetry } from "../../../../shared/logs/csv-telemetry";
import {
	clipToMatch,
	csvSeries,
	csvSeriesDef,
	downsample,
	dsLogSeries,
	DSLOG_SERIES,
	FMS_SERIES,
	fmsSeries,
	isMotorSupplyCurrent,
	pdChannelSeries,
	sampleRateHz,
	SUPERSEDED_BY,
	TOTAL_CURRENT,
	wpilogSeries,
	wpilogSeriesDef,
	type SeriesDef,
} from "../../../../shared/logs/series";
import { readWpilogEntry, sumWpilogEntries, wpilogClockOffset } from "../../../../shared/logs/wpilog";
import type { FMSLogFrame } from "../../../../shared/types";
import { db } from "../../../db/db";
import { matchLogs, teamUploadFiles, teamUploadMatches, teamUploads } from "../../../db/schema";
import { decompressStationLog } from "../../station-log-codec";
import { convertHootCached } from "../../uploads/hoot";
import { loadBytes } from "../../uploads/store";

/**
 * The assistant reading what a team uploaded.
 *
 * Same shape as the GitHub repo tools: every call is pinned to one upload id
 * resolved on the server, the model only ever supplies a path or an entry name,
 * and there is a budget so a curious model cannot read a 40 MB log into a
 * prompt. Nothing here writes anything.
 *
 * The series reader is the one that earns its keep. It puts our FMS station log
 * and the team's own Driver Station log on the same axis, which is how "the
 * battery sagged half a second before FMS saw us drop" becomes visible at all.
 */

export const MAX_UPLOAD_READS_PER_TURN = 6;
export const MAX_UPLOAD_READS_PER_CONVERSATION = 20;
export const MAX_UPLOAD_CHARS_PER_TURN = 90_000;

export class UploadToolError extends Error {}

export interface UploadRef {
	id: string;
	code: string;
	team: number | null;
	event: string | null;
}

/** Resolve an upload the signed-in volunteer is allowed to read. */
export async function findUpload(params: {
	code?: string;
	id?: string;
	eventCode: string | null;
}): Promise<UploadRef | null> {
	if (!params.code && !params.id) return null;
	const where = params.id
		? eq(teamUploads.id, params.id)
		: eq(teamUploads.code, (params.code ?? "").trim().toUpperCase());
	const upload = await db.query.teamUploads.findFirst({ where });
	if (!upload) return null;
	// An upload belongs to an event; a volunteer reads it only at that event.
	if (upload.event && params.eventCode && upload.event !== params.eventCode) return null;
	if (upload.event && !params.eventCode) return null;
	return { id: upload.id, code: upload.code, team: upload.team, event: upload.event };
}

/**
 * Team numbers mentioned in a conversation, newest turn first.
 *
 * Deliberately permissive: any three to five digit number counts, because a
 * volunteer writes "6615 keeps dropping out" as readily as "team 6615". That
 * costs nothing, because a number only attaches anything if that team actually
 * uploaded something at this event.
 */
const TEAM_PATTERN = /\b(?:team\s*#?\s*|frc\s*)?(\d{3,5})\b/gi;

export function teamNumbersFromTurns(turns: string[]): number[] {
	const seen: number[] = [];
	for (const turn of [...turns].reverse()) {
		for (const m of turn.matchAll(TEAM_PATTERN)) {
			const team = Number(m[1]);
			if (team > 0 && team < 100_000 && !seen.includes(team)) seen.push(team);
		}
	}
	return seen;
}

/**
 * The newest upload a team made at this event. This is how the assistant gets
 * hold of a team's logs: the volunteer says the team number, which they already
 * know, rather than a code somebody has to read out.
 */
export async function findUploadForTeam(team: number, eventCode: string | null): Promise<UploadRef | null> {
	if (!eventCode) return null;
	const upload = await db.query.teamUploads.findFirst({
		where: and(eq(teamUploads.team, team), eq(teamUploads.event, eventCode)),
		orderBy: (t, { desc }) => [desc(t.created_at)],
	});
	if (!upload) return null;
	return { id: upload.id, code: upload.code, team: upload.team, event: upload.event };
}

/** The first team mentioned that actually has an upload at this event. */
export async function findUploadFromTurns(turns: string[], eventCode: string | null): Promise<UploadRef | null> {
	for (const team of teamNumbersFromTurns(turns)) {
		const found = await findUploadForTeam(team, eventCode);
		if (found) return found;
	}
	return null;
}

/** What the team sent, and what we made of it. */
export async function listUploadFiles(uploadId: string): Promise<string> {
	const upload = await db.query.teamUploads.findFirst({ where: eq(teamUploads.id, uploadId) });
	if (!upload) throw new UploadToolError("That upload is gone.");
	const files = await db
		.select({
			id: teamUploadFiles.id,
			parent_id: teamUploadFiles.parent_id,
			path: teamUploadFiles.path,
			kind: teamUploadFiles.kind,
			size: teamUploadFiles.size,
		})
		.from(teamUploadFiles)
		.where(eq(teamUploadFiles.upload_id, uploadId))
		.orderBy(teamUploadFiles.path)
		.execute();
	const links = await db.select().from(teamUploadMatches).where(eq(teamUploadMatches.upload_id, uploadId)).execute();

	const lines: string[] = [];
	lines.push(`${upload.team ? `Team ${upload.team}` : "Team unknown"}, uploaded ${upload.created_at.toISOString()}.`);
	if (links.length > 0) {
		const seen = new Set<string>();
		const labels: string[] = [];
		for (const link of links) {
			const label = `${link.level} ${link.match_number}${link.station ? ` ${link.station}` : ""}`;
			if (seen.has(label)) continue;
			seen.add(label);
			labels.push(label);
		}
		lines.push(`Attached matches: ${labels.join(", ")}.`);
	}
	const top = files.filter((f) => f.parent_id === null);
	lines.push("", "Files the team uploaded:");
	for (const file of top) {
		const children = files.filter((f) => f.parent_id === file.id);
		lines.push(
			`  ${file.path}  [${KIND_LABELS[file.kind]}, ${Math.ceil(file.size / 1024)} KB]${children.length ? ` (${children.length} entries inside)` : ""}`,
		);
	}
	const inside = files.filter((f) => f.parent_id !== null);
	if (inside.length > 0) {
		lines.push("", "Inside those archives:");
		for (const file of inside.slice(0, 400)) lines.push(`  ${file.path}`);
		if (inside.length > 400) lines.push(`  ... ${inside.length - 400} more`);
	}
	return lines.join("\n");
}

/**
 * Everything we parsed out of the logs, in one document. This is the cheap first
 * read: it already holds the battery low point, the dropouts, the messages the
 * robot printed and the code's vendor libraries.
 */
export async function uploadSummary(uploadId: string): Promise<string> {
	const upload = await db.query.teamUploads.findFirst({ where: eq(teamUploads.id, uploadId) });
	if (!upload) throw new UploadToolError("That upload is gone.");
	const files = await db
		.select({ path: teamUploadFiles.path, kind: teamUploadFiles.kind, text_preview: teamUploadFiles.text_preview })
		.from(teamUploadFiles)
		.where(and(eq(teamUploadFiles.upload_id, uploadId)))
		.execute();
	const top = files.filter((f) => f.kind !== "text" || files.length === 1);
	const sections = top
		.filter((f) => f.text_preview)
		.map((f) => `### ${f.path} (${KIND_LABELS[f.kind]})\n${f.text_preview}`);
	if (sections.length === 0) return "Nothing in this upload could be parsed into a summary.";
	return sections.join("\n\n");
}

/** One file's text. Paths come from `list_upload_files`, never from the model's imagination. */
export async function readUploadFile(
	uploadId: string,
	path: string,
	maxChars: number,
): Promise<{ path: string; text: string }> {
	const files = await db.select().from(teamUploadFiles).where(eq(teamUploadFiles.upload_id, uploadId)).execute();
	const wanted = path.trim().replace(/^\.?\//, "");
	const file =
		files.find((f) => f.path === wanted) ??
		files.find((f) => f.path.toLowerCase() === wanted.toLowerCase()) ??
		files.find((f) => f.path.toLowerCase().endsWith(`/${wanted.toLowerCase()}`));
	if (!file) throw new UploadToolError(`No file called ${path} in this upload. Call list_upload_files first.`);

	let text = file.text_preview ?? "";
	if (!text) {
		const bytes = await loadBytes(file);
		text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, maxChars * 4));
	}
	if (!text.trim()) throw new UploadToolError(`${file.path} has no readable text.`);
	return { path: file.path, text: text.length > maxChars ? `${text.slice(0, maxChars)}\n\n[truncated]` : text };
}

/**
 * The Driver Station's event log for a match, on the match clock.
 *
 * `read_upload_file` can reach the same file, but its preview counts seconds
 * from the start of the file and stops at 200 lines. Lined up against the match
 * the way the viewer shows it, "Input Voltage Brownout at 87.6s" can be read
 * against the series the model already pulled for the same match.
 */
export async function readDsEventsForMatch(uploadId: string, matchId: string, limit = 400): Promise<string> {
	const match = await db.query.matchLogs.findFirst({ where: eq(matchLogs.id, matchId) });
	if (!match) throw new UploadToolError("That match is not one of ours.");
	const files = await db
		.select()
		.from(teamUploadFiles)
		.where(and(eq(teamUploadFiles.upload_id, uploadId), eq(teamUploadFiles.kind, "dsevents")))
		.execute();
	if (files.length === 0) throw new UploadToolError("This upload has no Driver Station event log.");

	const matchStart = match.start_time.getTime() / 1000;
	const lines: { t: number; text: string }[] = [];
	for (const file of files) {
		const parsed = readDsEvents(await loadBytes(file));
		if (!parsed.parsed || parsed.startTime === null) continue;
		const offset = parsed.startTime - matchStart;
		for (const entry of parsed.entries) lines.push({ t: entry.timestamp + offset, text: entry.text });
	}
	if (lines.length === 0) throw new UploadToolError("The Driver Station event log could not be read.");
	lines.sort((a, b) => a.t - b.t);

	const shown = lines.slice(0, limit);
	return [
		`Driver Station events, seconds from the start of ${match.level} ${match.match_number}. Negative is before the match started.`,
		...shown.map((line) => `  ${line.t >= 0 ? " " : ""}${line.t.toFixed(2)}  ${line.text}`),
		...(lines.length > shown.length ? [`  ... ${lines.length - shown.length} more lines`] : []),
	].join("\n");
}

/** Data log entries the team logged themselves, so the model can ask for one by name. */
export async function readLogEntry(uploadId: string, path: string, entryName: string, limit: number): Promise<string> {
	const file = await fileByPath(uploadId, path);
	if (file.kind !== "wpilog" && file.kind !== "hoot") {
		throw new UploadToolError(`${file.path} is not a data log or a CTRE signal log, so it has no entries.`);
	}
	const bytes = await logBytes(file);
	const samples = readWpilogEntry(bytes, entryName, limit);
	if (samples.length === 0) throw new UploadToolError(`No entry called ${entryName} in ${file.path}.`);
	return [
		`${entryName} in ${file.path}, ${samples.length} samples (log time in seconds):`,
		...samples.map((s) => `  ${(s.timestamp / 1e6).toFixed(3)}  ${s.value}`),
	].join("\n");
}

/**
 * The data log bytes for a file. A Hoot is converted on the way, because the
 * conversion is too large to keep with the upload.
 */
async function logBytes(file: {
	id: string;
	kind: string;
	content: string | null;
	gcs_path: string | null;
}): Promise<Uint8Array> {
	const raw = await loadBytes(file);
	return file.kind === "hoot" ? convertHootCached(file.id, raw) : raw;
}

/**
 * Total current out of the battery, from whichever source the upload has.
 *
 * The power distribution board is the honest answer when the Driver Station log
 * carries its channels: one measurement of everything past the main breaker, at
 * 50 Hz. Failing that the motor controllers' supply currents are summed, which
 * is the same question asked of a different set of devices and will read low by
 * whatever the robot draws outside them, so the label says which one you got.
 */
async function totalCurrent(
	def: SeriesDef,
	dsResult: DsLogResult | null,
	files: { id: string; kind: string; path: string; content: string | null; gcs_path: string | null }[],
	matchStartMs: number,
	points: number,
	notes: string[],
): Promise<{ def: SeriesDef; points: { t: number; v: number | null }[] } | null> {
	if (dsResult?.parsed && (dsResult.entries[0]?.powerDistributionCurrents.length ?? 0) > 0) {
		const pdDef: SeriesDef = { ...def, key: "ds.pd.total", label: "Total current (PD)", from: "dslog" };
		const series = dsLogSeries(dsResult, pdDef, matchStartMs);
		return { def: pdDef, points: downsample(clipToMatch(series.points), points) };
	}

	const logFile = files.find((f) => f.kind === "wpilog") ?? files.find((f) => f.kind === "hoot");
	if (!logFile) {
		notes.push(`${def.key}: no power distribution channels and no data log, so there is nothing to add up.`);
		return null;
	}
	const bytes = await logBytes(logFile);
	let offset = wpilogClockOffset(bytes);
	if (offset === null && logFile.kind === "hoot") offset = matchStartMs / 1000;
	if (offset === null) {
		notes.push(`${def.key}: the data log has no systemTime entry, so it cannot be placed on the match clock.`);
		return null;
	}
	const summed = sumWpilogEntries(bytes, isMotorSupplyCurrent);
	if (summed.points.length === 0) {
		notes.push(`${def.key}: no supply current signals in ${logFile.path}.`);
		return null;
	}
	const motorDef: SeriesDef = {
		...def,
		label: `Total current (${summed.names.length} motors)`,
	};
	const series = {
		points: summed.points.map((p) => ({
			t: p.timestamp / 1e6 + offset - matchStartMs / 1000,
			v: p.value,
		})),
	};
	notes.push(
		`${def.key}: summed from ${summed.names.length} motor controllers, so anything not on a logged controller is missing.`,
	);
	return { def: motorDef, points: downsample(clipToMatch(series.points), points) };
}

async function fileByPath(uploadId: string, path: string) {
	const files = await db.select().from(teamUploadFiles).where(eq(teamUploadFiles.upload_id, uploadId)).execute();
	const wanted = path.trim();
	const file =
		files.find((f) => f.path === wanted) ?? files.find((f) => f.path.toLowerCase() === wanted.toLowerCase());
	if (!file) throw new UploadToolError(`No file called ${path} in this upload.`);
	return file;
}

/** Series the model may ask for, given what this upload actually contains. */
export async function availableSeries(uploadId: string): Promise<string> {
	const files = await db
		.select({ path: teamUploadFiles.path, kind: teamUploadFiles.kind, meta: teamUploadFiles.meta })
		.from(teamUploadFiles)
		.where(eq(teamUploadFiles.upload_id, uploadId))
		.execute();
	const lines: string[] = [];
	const links = await db.select().from(teamUploadMatches).where(eq(teamUploadMatches.upload_id, uploadId)).execute();
	if (links.length > 0) {
		// Several files can attach the same match, one row each. List the match once.
		const byMatch = new Map<string, (typeof links)[number]>();
		for (const link of links) {
			const existing = byMatch.get(link.match_id);
			// Prefer the row that knows the station, since that is the one that can
			// also plot the field's own log.
			if (!existing || (!existing.station && link.station)) byMatch.set(link.match_id, link);
		}
		lines.push("Matches with a field log to compare against:");
		for (const link of byMatch.values()) {
			lines.push(
				`  ${link.level} ${link.match_number} play ${link.play_number}${link.station ? ` (${link.station})` : ""}  match_id=${link.match_id}`,
			);
		}
		lines.push("", "From the field's own log (always available for an attached match):");
		for (const def of FMS_SERIES) lines.push(`  ${def.key}  ${def.label}${def.unit ? ` (${def.unit})` : ""}`);
	}
	if (files.some((f) => f.kind === "dslog" || f.kind === "wpilog" || f.kind === "hoot")) {
		lines.push(
			"",
			"Summed rather than recorded:",
			`  ${TOTAL_CURRENT.key}  ${TOTAL_CURRENT.label} (A), from the power distribution channels where the Driver Station log has them, otherwise from the motor controllers' supply currents`,
		);
	}
	if (files.some((f) => f.kind === "dslog")) {
		lines.push("", "From the team's Driver Station log:");
		for (const def of DSLOG_SERIES) lines.push(`  ${def.key}  ${def.label}${def.unit ? ` (${def.unit})` : ""}`);
		lines.push("  ds.pd.<channel>  power distribution channel current (A)");
	}
	for (const file of files.filter((f) => f.kind === "wpilog")) {
		const entries =
			(file.meta as { entries?: { name: string; type: string; count: number }[] } | null)?.entries ?? [];
		const numeric = entries.filter((e) => ["double", "float", "int64", "boolean"].includes(e.type));
		if (numeric.length === 0) continue;
		lines.push(
			"",
			`From the ${file.kind === "hoot" ? "CTRE signal log" : "data log"} ${file.path}, ask for log.<entry name>:`,
		);
		for (const entry of numeric.slice(0, 120))
			lines.push(`  ${entry.name}  (${entry.type}, ${entry.count} samples)`);
		if (numeric.length > 120) lines.push(`  ... ${numeric.length - 120} more`);
	}
	for (const file of files.filter((f) => f.kind === "csv")) {
		const meta = file.meta as {
			csv?: { absoluteTime?: boolean; series?: { label: string; count: number }[] };
		} | null;
		const signals = meta?.csv?.series ?? [];
		if (signals.length === 0) continue;
		if (!meta?.csv?.absoluteTime) {
			lines.push("", `${file.path} has a relative time column, so it cannot be lined up with a match.`);
			continue;
		}
		lines.push("", `From the telemetry CSV ${file.path}, ask for csv.<signal name>:`);
		for (const signal of signals.slice(0, 120)) lines.push(`  ${signal.label}  (${signal.count} samples)`);
		if (signals.length > 120) lines.push(`  ... ${signals.length - 120} more`);
	}
	return lines.length > 0 ? lines.join("\n") : "This upload has no plottable series.";
}

/**
 * The same catalogue as `availableSeries`, structured for the series picker.
 * The prose version is written for the assistant's prompt; the UI needs the
 * keys and their units, not sentences about them.
 */
export interface SeriesOption {
	key: string;
	label: string;
	unit?: string;
	axis: string;
	/** Which log it comes from, used as the group heading in the picker. */
	group: string;
}

export async function seriesOptions(uploadId: string): Promise<SeriesOption[]> {
	const files = await db
		.select({ path: teamUploadFiles.path, kind: teamUploadFiles.kind, meta: teamUploadFiles.meta })
		.from(teamUploadFiles)
		.where(eq(teamUploadFiles.upload_id, uploadId))
		.execute();

	const out: SeriesOption[] = [];
	const push = (def: SeriesDef, group: string) =>
		out.push({ key: def.key, label: def.label, unit: def.unit, axis: def.axis, group });

	for (const def of FMS_SERIES) push(def, "Field monitor");

	// Nothing records total current, so it is offered whenever there is anything
	// to add up: the Driver Station log's channels, or a device log's motors.
	if (files.some((f) => f.kind === "dslog" || f.kind === "wpilog" || f.kind === "hoot")) {
		push(TOTAL_CURRENT, "Derived");
	}

	if (files.some((f) => f.kind === "dslog")) {
		for (const def of DSLOG_SERIES) push(def, "Driver Station");
		// Channel count is in the file's own summary, so the picker can list the
		// channels that exist rather than a fixed 24.
		// Uploads ingested before `pdChannels` was stored fall back to the summary,
		// which has held one peak per channel all along.
		const channels = Math.max(
			0,
			...files
				.filter((f) => f.kind === "dslog")
				.map((f) => {
					const meta = f.meta as {
						pdChannels?: number;
						summary?: { peakChannelCurrents?: number[] };
					} | null;
					return meta?.pdChannels ?? meta?.summary?.peakChannelCurrents?.length ?? 0;
				}),
		);
		for (const def of pdChannelSeries(channels)) push(def, "Power distribution");
	}

	for (const file of files.filter((f) => f.kind === "wpilog" || f.kind === "hoot")) {
		const entries =
			(file.meta as { entries?: { name: string; type: string; count: number }[] } | null)?.entries ?? [];
		const group = file.kind === "hoot" ? `Hoot: ${file.path}` : `Data log: ${file.path}`;
		for (const entry of entries) {
			if (!["double", "float", "int64", "boolean"].includes(entry.type)) continue;
			push(wpilogSeriesDef(entry.name), group);
		}
	}

	for (const file of files.filter((f) => f.kind === "csv")) {
		const meta = file.meta as {
			csv?: { absoluteTime?: boolean; series?: { label: string; count: number }[] };
		} | null;
		if (!meta?.csv?.absoluteTime) continue;
		for (const signal of meta.csv.series ?? []) push(csvSeriesDef(signal.label), `CSV: ${file.path}`);
	}

	return out;
}

function seriesDefFor(key: string, pdChannels: number): SeriesDef | null {
	const fms = FMS_SERIES.find((d) => d.key === key);
	if (fms) return fms;
	const ds = DSLOG_SERIES.find((d) => d.key === key);
	if (ds) return ds;
	if (key === TOTAL_CURRENT.key) return TOTAL_CURRENT;
	if (key === "ds.pd.total")
		return { ...TOTAL_CURRENT, key: "ds.pd.total", label: "Total current (PD)", from: "dslog" };
	const pd = /^ds\.pd\.(\d+)$/.exec(key);
	if (pd) return pdChannelSeries(pdChannels).find((d) => d.key === key) ?? null;
	if (key.startsWith("log.")) return wpilogSeriesDef(key.slice(4));
	if (key.startsWith("csv.")) return csvSeriesDef(key.slice(4));
	return null;
}

export interface SeriesRequest {
	uploadId: string;
	matchId: string;
	keys: string[];
	/** Samples per series after thinning. Keep it small: this goes into a prompt. */
	points: number;
}

export interface SeriesData {
	label: string;
	level: string;
	matchNumber: number;
	station: string | null;
	series: {
		key: string;
		label: string;
		unit?: string;
		axis: string;
		from: string;
		/** Rate the samples actually arrived at, measured rather than assumed. */
		hz: number | null;
		/** Set when a series the team uploaded records the same thing faster. */
		supersededBy?: { key: string; because: string };
		points: { t: number; v: number | null }[];
	}[];
	/** Series that could not be read, each with why. Shown rather than dropped. */
	notes: string[];
}

/**
 * Read several series onto one axis: seconds from match start, so what FMS saw
 * and what the team's laptop saw line up instant for instant.
 *
 * Every Driver Station log attached to this match is merged, because the Driver
 * Station starts a new file whenever the robot link drops, so one match can
 * arrive as two logs.
 */
export async function readSeriesData(request: SeriesRequest): Promise<SeriesData> {
	const match = await db.query.matchLogs.findFirst({ where: eq(matchLogs.id, request.matchId) });
	if (!match) throw new UploadToolError("That match is not one of ours.");
	const link = await db.query.teamUploadMatches.findFirst({
		where: and(eq(teamUploadMatches.upload_id, request.uploadId), eq(teamUploadMatches.match_id, request.matchId)),
	});
	if (!link) throw new UploadToolError("That match is not attached to this upload. Call list_log_series first.");

	const matchStartMs = match.start_time.getTime();
	const files = await db
		.select()
		.from(teamUploadFiles)
		.where(eq(teamUploadFiles.upload_id, request.uploadId))
		.execute();
	const out: { def: SeriesDef; points: { t: number; v: number | null }[] }[] = [];
	const notes: string[] = [];

	// Our own station log, for whichever station the upload belongs to.
	const station = link.station ?? null;
	let fmsFrames: FMSLogFrame[] = [];
	if (station) {
		const raw = match[`${station}_log` as "red1_log"];
		if (raw) fmsFrames = decompressStationLog(raw as string);
	}

	// Every Driver Station log in this upload, merged onto one timeline. The
	// entries carry seconds from their own file's start, so each file's entries
	// are shifted onto the first file's clock before they are put together.
	const dsFiles = files.filter((f) => f.kind === "dslog");
	const dsParsed: DsLogResult[] = [];
	for (const file of dsFiles) {
		const parsed = readDsLog(await loadBytes(file));
		if (parsed.parsed && parsed.startTime !== null) dsParsed.push(parsed);
	}
	let dsResult: DsLogResult | null = null;
	if (dsParsed.length === 1) {
		dsResult = dsParsed[0];
	} else if (dsParsed.length > 1) {
		const base = Math.min(...dsParsed.map((r) => r.startTime!));
		const entries = dsParsed
			.flatMap((r) => r.entries.map((e) => ({ ...e, timestamp: e.timestamp + (r.startTime! - base) })))
			.sort((a, b) => a.timestamp - b.timestamp);
		dsResult = {
			parsed: true,
			version: dsParsed[0].version,
			startTime: base,
			entries,
			stoppedEarly: dsParsed.some((r) => r.stoppedEarly),
		};
	}
	const pdChannels = dsResult?.entries[0]?.powerDistributionCurrents.length ?? 0;

	for (const key of request.keys.slice(0, 8)) {
		const def = seriesDefFor(key, pdChannels);
		if (!def) {
			notes.push(`${key}: not a series in this upload.`);
			continue;
		}
		if (def.from === "fms") {
			if (fmsFrames.length === 0) {
				notes.push(`${key}: we have no field log for ${station ?? "this station"} in that match.`);
				continue;
			}
			const series = fmsSeries(fmsFrames, def, matchStartMs);
			out.push({ def, points: downsample(clipToMatch(series.points), request.points) });
		} else if (def.from === "dslog") {
			if (!dsResult?.parsed) {
				notes.push(`${key}: this upload has no readable Driver Station log.`);
				continue;
			}
			const series = dsLogSeries(dsResult, def, matchStartMs);
			out.push({ def, points: downsample(clipToMatch(series.points), request.points) });
		} else if (def.from === "derived") {
			const resolved = await totalCurrent(def, dsResult, files, matchStartMs, request.points, notes);
			if (resolved) out.push(resolved);
		} else if (def.from === "csv") {
			const label = def.key.slice(4);
			const csvFile = files.find((f) => f.kind === "csv");
			if (!csvFile) {
				notes.push(`${key}: this upload has no telemetry CSV.`);
				continue;
			}
			const text = new TextDecoder("utf-8", { fatal: false }).decode(await loadBytes(csvFile));
			const csv = readCsvTelemetry(text);
			const signal = csv.series.find((s) => s.label === label);
			if (!signal) {
				notes.push(`${key}: no signal called ${label} in ${csvFile.path}.`);
				continue;
			}
			if (!csv.absoluteTime) {
				notes.push(
					`${key}: ${csvFile.path} has a relative time column, so it cannot be placed on the match clock.`,
				);
				continue;
			}
			const series = csvSeries(signal.points, def, csv.absoluteTime, matchStartMs);
			out.push({ def, points: downsample(clipToMatch(series.points), request.points) });
		} else {
			const entryName = def.key.slice(4);
			// Prefer a real data log; a Hoot works too but has to be converted.
			const logFile = files.find((f) => f.kind === "wpilog") ?? files.find((f) => f.kind === "hoot");
			if (!logFile) {
				notes.push(`${key}: this upload has no data log.`);
				continue;
			}
			const bytes = await logBytes(logFile);
			let offset = wpilogClockOffset(bytes);
			if (offset === null && logFile.kind === "hoot") {
				// A CTRE log has no wall clock at all: owlet writes signal time from
				// the start of the log. The file name says which match it is, so the
				// log is laid against that match's start. Phoenix begins logging when
				// the robot is enabled, so this can sit a few seconds out, and the
				// note below says so rather than presenting it as exact.
				offset = matchStartMs / 1000;
				notes.push(
					`${key}: the CTRE log carries no wall clock, so it is lined up with the start of ${link.level} ${link.match_number}. Phoenix starts logging on enable, so it can be a few seconds out.`,
				);
			}
			if (offset === null) {
				notes.push(`${key}: the data log has no systemTime entry, so it cannot be placed on the match clock.`);
				continue;
			}
			const series = wpilogSeries(readWpilogEntry(bytes, entryName, 20_000), def, offset, matchStartMs);
			if (series.points.length === 0) {
				notes.push(`${key}: no samples for that entry.`);
				continue;
			}
			out.push({ def, points: downsample(clipToMatch(series.points), request.points) });
		}
	}

	return {
		label: `${link.level} ${link.match_number}${link.play_number > 1 ? ` play ${link.play_number}` : ""}`,
		level: link.level,
		matchNumber: link.match_number,
		station,
		series: out.map((s) => ({
			key: s.def.key,
			label: s.def.label,
			unit: s.def.unit,
			axis: s.def.axis,
			from: s.def.from,
			hz: sampleRateHz(s.points),
			// Only worth saying when the faster series is actually here.
			supersededBy: SUPERSEDED_BY[s.def.key] && dsResult?.parsed ? SUPERSEDED_BY[s.def.key] : undefined,
			points: s.points,
		})),
		notes,
	};
}

/**
 * The same data as a table a model reads well.
 *
 * The sources sample at different rates, so a table built from the union of
 * their timestamps would be mostly holes: the 50 Hz series would put a row every
 * 20 ms and the slow one would be blank in almost all of them. So this lays down
 * an even grid and fills each cell from the last sample at or before that
 * instant, and only while that sample is still fresh for its own rate. A slow
 * series holds its value across the grid; it never invents one, and a real gap
 * stays a gap.
 */
export async function readSeries(request: SeriesRequest): Promise<string> {
	const data = await readSeriesData(request);
	if (data.series.length === 0) return data.notes.join("\n") || "Nothing could be read for those series.";

	const times = data.series.flatMap((s) => s.points.map((p) => p.t));
	const from = Math.min(...times);
	const to = Math.max(...times);
	const span = Math.max(to - from, 0.1);
	const MAX_ROWS = 300;
	const step = Math.max(0.1, Math.ceil((span / MAX_ROWS) * 10) / 10);

	// A sample is good for two of its own intervals. At 50 Hz that is 40 ms; for a
	// slower source it is proportionally longer, which is how long its value stands.
	const holds = data.series.map((s) => (s.hz && s.hz > 0 ? Math.max(2 / s.hz, step) : step * 2));
	const cursors = data.series.map(() => 0);

	const header = [
		"t(s)",
		...data.series.map(
			(s) => `${s.label}${s.unit ? ` ${s.unit}` : ""}${s.hz ? ` @${s.hz.toFixed(s.hz < 10 ? 1 : 0)}Hz` : ""}`,
		),
	].join(" | ");

	const rows: string[] = [];
	for (let t = from; t <= to && rows.length < MAX_ROWS; t += step) {
		const cells = data.series.map((series, index) => {
			// Walk forward only: the grid is increasing, so each series is scanned once.
			while (cursors[index] + 1 < series.points.length && series.points[cursors[index] + 1].t <= t)
				cursors[index]++;
			const point = series.points[cursors[index]];
			if (!point || point.t > t + 1e-9 || t - point.t > holds[index]) return "";
			if (point.v === null) return "";
			return Number.isInteger(point.v) ? String(point.v) : point.v.toFixed(2);
		});
		if (cells.some((c) => c !== "")) rows.push([t.toFixed(1), ...cells].join(" | "));
	}

	const rateNote = data.series
		.filter((s) => s.supersededBy)
		.map((s) => `${s.key} is also in the team's own log as ${s.supersededBy!.key}: ${s.supersededBy!.because}.`);

	return [
		`${data.label}${data.station ? ` ${data.station}` : ""}, seconds from match start, sampled every ${step.toFixed(1)} s.`,
		"A blank cell means that source had nothing recent enough to stand for that instant.",
		...(rateNote.length > 0 ? ["", ...rateNote] : []),
		...(data.notes.length > 0 ? ["", ...data.notes] : []),
		"",
		header,
		...rows,
		to - from > MAX_ROWS * step
			? `... the window is longer than ${MAX_ROWS} rows; ask for a narrower set of series.`
			: "",
	]
		.filter(Boolean)
		.join("\n");
}
