import { and, eq } from "drizzle-orm";
import { KIND_LABELS } from "../../../../shared/logs/detect";
import { readDsLog } from "../../../../shared/logs/dslog";
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
	pdChannelSeries,
	wpilogSeries,
	wpilogSeriesDef,
	type SeriesDef,
} from "../../../../shared/logs/series";
import { readWpilogEntry, wpilogClockOffset } from "../../../../shared/logs/wpilog";
import type { FMSLogFrame } from "../../../../shared/types";
import { db } from "../../../db/db";
import { matchLogs, teamUploadFiles, teamUploadMatches, teamUploads } from "../../../db/schema";
import { decompressStationLog } from "../../log-analysis";
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

/** `7K2M-QX4T` anywhere in a message attaches that upload. */
const CODE_PATTERN = /\b([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4})\b/;

export function uploadCodeFromTurns(turns: string[]): string | null {
	for (const turn of [...turns].reverse()) {
		const m = CODE_PATTERN.exec(turn.toUpperCase());
		if (m) return m[1];
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
	lines.push(`Upload ${upload.code}${upload.team ? `, team ${upload.team}` : ", team unknown"}.`);
	if (links.length > 0) {
		lines.push(
			`Attached matches: ${links.map((l) => `${l.level} ${l.match_number}${l.station ? ` ${l.station}` : ""}`).join(", ")}.`,
		);
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

/** Data log entries the team logged themselves, so the model can ask for one by name. */
export async function readLogEntry(uploadId: string, path: string, entryName: string, limit: number): Promise<string> {
	const file = await fileByPath(uploadId, path);
	if (file.kind !== "wpilog") throw new UploadToolError(`${file.path} is not a data log, so it has no entries.`);
	const samples = readWpilogEntry(await loadBytes(file), entryName, limit);
	if (samples.length === 0) throw new UploadToolError(`No entry called ${entryName} in ${file.path}.`);
	return [
		`${entryName} in ${file.path}, ${samples.length} samples (log time in seconds):`,
		...samples.map((s) => `  ${(s.timestamp / 1e6).toFixed(3)}  ${s.value}`),
	].join("\n");
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
		lines.push("Matches with a field log to compare against:");
		for (const link of links) {
			lines.push(
				`  ${link.level} ${link.match_number} play ${link.play_number}${link.station ? ` (${link.station})` : ""}  match_id=${link.match_id}`,
			);
		}
		lines.push("", "From the field's own log (always available for an attached match):");
		for (const def of FMS_SERIES) lines.push(`  ${def.key}  ${def.label}${def.unit ? ` (${def.unit})` : ""}`);
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
		lines.push("", `From the data log ${file.path}, ask for log.<entry name>:`);
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

function seriesDefFor(key: string, pdChannels: number): SeriesDef | null {
	const fms = FMS_SERIES.find((d) => d.key === key);
	if (fms) return fms;
	const ds = DSLOG_SERIES.find((d) => d.key === key);
	if (ds) return ds;
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

/**
 * Read several series on one axis, as text a model can reason over. Seconds are
 * relative to match start, so a row reads across: what FMS saw and what the
 * team's laptop saw at the same instant.
 */
export async function readSeries(request: SeriesRequest): Promise<string> {
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

	// The team's Driver Station log, parsed once and reused for every ds.* key.
	const dsFile = files.find((f) => f.kind === "dslog");
	const dsResult = dsFile ? readDsLog(await loadBytes(dsFile)) : null;
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
			const logFile = files.find((f) => f.kind === "wpilog");
			if (!logFile) {
				notes.push(`${key}: this upload has no data log.`);
				continue;
			}
			const bytes = await loadBytes(logFile);
			const offset = wpilogClockOffset(bytes);
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

	if (out.length === 0) return notes.join("\n") || "Nothing could be read for those series.";

	// One row per sampled instant, columns in the order asked for. A model reads
	// this far better than several separate lists.
	const times = [...new Set(out.flatMap((s) => s.points.map((p) => Math.round(p.t * 10) / 10)))].sort(
		(a, b) => a - b,
	);
	const header = ["t(s)", ...out.map((s) => s.def.label + (s.def.unit ? ` ${s.def.unit}` : ""))].join(" | ");
	const rows = times.slice(0, 400).map((t) => {
		const cells = out.map((series) => {
			let nearest: { t: number; v: number | null } | null = null;
			for (const point of series.points) {
				if (nearest === null || Math.abs(point.t - t) < Math.abs(nearest.t - t)) nearest = point;
			}
			if (!nearest || Math.abs(nearest.t - t) > 0.6) return "";
			return nearest.v === null ? "" : Number.isInteger(nearest.v) ? String(nearest.v) : nearest.v.toFixed(2);
		});
		return [t.toFixed(1), ...cells].join(" | ");
	});

	return [
		`${link.level} ${link.match_number}${link.station ? ` ${link.station}` : ""}, seconds from match start.`,
		...(notes.length > 0 ? ["", ...notes, ""] : [""]),
		header,
		...rows,
		times.length > 400 ? `... ${times.length - 400} more rows` : "",
	]
		.filter(Boolean)
		.join("\n");
}
