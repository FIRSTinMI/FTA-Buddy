import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { describeCsvTelemetry, readCsvTelemetry } from "../../../shared/logs/csv-telemetry";
import { detectKind, hasAcceptedExtension, type UploadKind } from "../../../shared/logs/detect";
import {
	matchInfoFromDsEvents,
	readDsEvents,
	readDsLog,
	summarizeDsLog,
	summarizeDsLogWindow,
	type DsEventsMatchInfo,
	type DsLogResult,
} from "../../../shared/logs/dslog";
import { parseHootFileName, parseWpilogFileName, wpilogNameFromDsEvents } from "../../../shared/logs/filenames";
import {
	levelFromDsEvents,
	linkByFileName,
	linkByMatchInfo,
	linkByMatchNumber,
	linkByTimestamp,
	pickTeam,
	type CandidateMatch,
	type MatchLevel,
	type MatchLink,
	type TeamSource,
} from "../../../shared/logs/match-link";
import {
	readRobotCode,
	stripCommonPrefix,
	teamFromSupportBundle,
	type CodeFile,
} from "../../../shared/logs/robot-code";
import { describeDsEvents, describeDsLog, describeRobotCode, describeWpilog } from "../../../shared/logs/summarize";
import { readWpilog, wpilogClockOffset, type WpilogMatchInfo } from "../../../shared/logs/wpilog";
import { db } from "../../db/db";
import { matchLogs, teamUploadFiles, teamUploadMatches, teamUploads } from "../../db/schema";
import { screenForInstructions } from "../untrusted-text";
import { inferEvent, UNASSIGNED_REASON } from "./event-inference";
import { convertHoot, HootError, hootCompliancy, hootDecodeEnabled } from "./hoot";
import { MAX_FILES_PER_UPLOAD, MAX_UPLOAD_BYTES, storeBytes, UploadTooLargeError } from "./store";
import { entryText, keepBundleEntry, keepCodeEntry, readZip } from "./zip";

/**
 * Taking a team's files and working out what they are.
 *
 * The rule throughout: store first, parse second, and never let a parse failure
 * lose a file. A CSA standing at a pit table would rather have an unreadable log
 * they can hand to somebody else than an error page.
 */

/** Text kept on a row for the preview and for prompts. */
const MAX_PREVIEW_CHARS = 60_000;

export interface IncomingFile {
	fileName: string;
	data: Uint8Array;
}

export interface IngestParams {
	files: IncomingFile[];
	source: "portal" | "app";
	/** Null when the portal was used without an event code. Nothing links to matches then. */
	event?: { code: string } | null;
	/** Team number typed on the form. The weakest evidence we have. */
	enteredTeam?: number | null;
	uploaderName?: string | null;
	uploadedBy?: number | null;
	notes?: string | null;
	ipHash?: string | null;
}

export interface IngestResult {
	id: string;
	code: string;
	/** The event it landed at, null when nothing placed it. */
	event: string | null;
	/** The sentence explaining why, shown to whoever uploaded it. */
	eventWhy: string | null;
	team: number | null;
	teamSource: TeamSource;
	files: { id: string; path: string; kind: UploadKind; size: number }[];
	matches: MatchLink[];
	/** Things a person should know: a file we could not read, a file too big, a link we could not make. */
	warnings: string[];
}

/** No 0, O, 1, I or L: this code gets read out across a pit table and typed by hand. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomCode(): string {
	const pick = () =>
		Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
	return `${pick()}-${pick()}`;
}

async function uniqueCode(): Promise<string> {
	for (let attempt = 0; attempt < 8; attempt++) {
		const code = randomCode();
		const existing = await db.query.teamUploads.findFirst({ where: eq(teamUploads.code, code) });
		if (!existing) return code;
	}
	// 31^8 codes; eight collisions means something else is wrong.
	throw new Error("Could not allocate an upload code");
}

/** The matches we could attach a log to. Empty when there is no event. */
async function candidateMatches(eventCode: string | undefined): Promise<CandidateMatch[]> {
	if (!eventCode) return [];
	const rows = await db
		.select({
			id: matchLogs.id,
			level: matchLogs.level,
			match_number: matchLogs.match_number,
			play_number: matchLogs.play_number,
			start_time: matchLogs.start_time,
			red1: matchLogs.red1,
			red2: matchLogs.red2,
			red3: matchLogs.red3,
			blue1: matchLogs.blue1,
			blue2: matchLogs.blue2,
			blue3: matchLogs.blue3,
		})
		.from(matchLogs)
		.where(eq(matchLogs.event, eventCode))
		.execute();
	return rows as CandidateMatch[];
}

function clip(text: string): string {
	return text.length > MAX_PREVIEW_CHARS ? `${text.slice(0, MAX_PREVIEW_CHARS)}\n\n[truncated]` : text;
}

interface PreparedFile {
	id: string;
	parentId: string | null;
	path: string;
	kind: UploadKind;
	size: number;
	data: Uint8Array;
	meta: Record<string, unknown> | null;
	preview: string | null;
	/** Filled in by the linking pass, once the event is known. */
	links: MatchLink[];
	/**
	 * What linking and event inference need, gathered while parsing. Parsing
	 * cannot link, because which event this belongs to is not known until every
	 * file has been read and its evidence weighed.
	 */
	/** The parsed Driver Station log. Also re-windowed per match. Never stored. */
	dsResult?: DsLogResult;
	/** Match info read out of a `.dsevents` file. */
	dsEventsInfo?: DsEventsMatchInfo;
	/** Match info a data log recorded over NetworkTables. */
	wpilogMatch?: WpilogMatchInfo;
	/** What a data log's file name said, once FMS renamed it. */
	wpilogName?: ReturnType<typeof parseWpilogFileName>;
	/** What a Hoot log's file name said, which is the only place it says anything. */
	hootName?: ReturnType<typeof parseHootFileName>;
	/** Wall-clock span of a telemetry CSV, when its times are absolute. */
	csvRange?: { from: number; to: number };
	/** An event name this file claimed, for working out which event this is. */
	eventName?: string;
	/** When this file was written, in unix seconds. */
	writtenAt?: number;
}

/**
 * Work out what one uploaded file is and what it says. Zips come back as the zip
 * itself plus a child row per entry worth keeping.
 */
async function prepareFile(
	incoming: IncomingFile,
	warnings: string[],
	teamCandidates: { team: number; source: TeamSource }[],
): Promise<PreparedFile[]> {
	const path = incoming.fileName.replace(/^.*[/\\]/, "");
	const data = incoming.data;
	let kind = detectKind(path, data);
	const out: PreparedFile[] = [];
	const rootId = randomUUID();

	// A zip has to be opened before we know whether it is code or a support bundle.
	let zipPaths: string[] | undefined;
	if (kind === "zip" || kind === "support-bundle") {
		const listing = readZip(data, () => false);
		zipPaths = listing.allPaths;
		kind = detectKind(path, data, zipPaths);
		if (listing.skipped.some((s) => s.path === "")) {
			warnings.push(`${path}: the archive could not be opened, so only the file itself was stored.`);
		}
	}

	const root: PreparedFile = {
		id: rootId,
		parentId: null,
		path,
		kind,
		size: data.byteLength,
		data,
		meta: null,
		preview: null,
		links: [],
	};
	out.push(root);

	switch (kind) {
		case "wpilog": {
			const summary = readWpilog(data);
			if (!summary.valid) {
				warnings.push(`${path}: not a readable data log.`);
				root.preview = "Not a readable data log.";
				break;
			}
			const name = parseWpilogFileName(path);
			root.meta = {
				match: summary.match,
				fileName: name,
				durationSecs: summary.durationSecs,
				recordCount: summary.recordCount,
				entries: summary.entries.slice(0, 500).map((e) => ({ name: e.name, type: e.type, count: e.count })),
				entriesTruncated: summary.entriesTruncated,
				entryCount: summary.entries.length,
				messageCount: summary.messages.length,
				stoppedEarly: summary.stoppedEarly,
			};
			root.preview = clip(describeWpilog(summary));
			root.wpilogMatch = summary.match;
			root.wpilogName = name;
			root.eventName = summary.match.eventName ?? name?.eventName;
			// A data log counts from robot boot, so its wall clock is the systemTime
			// entry, falling back to the timestamp in its own name.
			const offset = wpilogClockOffset(data);
			root.writtenAt = offset !== null ? offset : name?.startedAt ? name.startedAt.getTime() / 1000 : undefined;
			break;
		}

		case "dslog": {
			const result = readDsLog(data);
			if (!result.parsed) {
				warnings.push(
					`${path}: Driver Station log version ${result.version ?? "unknown"} is not one we can read.`,
				);
				root.preview = "Driver Station log version not recognised.";
				break;
			}
			const summary = summarizeDsLog(result);
			root.dsResult = result;
			root.meta = { startTime: result.startTime, summary, stoppedEarly: result.stoppedEarly };
			root.preview = clip(describeDsLog(summary, result.startTime));
			root.writtenAt = result.startTime ?? undefined;
			break;
		}

		case "dsevents": {
			const result = readDsEvents(data);
			if (!result.parsed) {
				warnings.push(
					`${path}: Driver Station events version ${result.version ?? "unknown"} is not one we can read.`,
				);
				root.preview = "Driver Station events version not recognised.";
				break;
			}
			const texts = result.entries.map((e) => e.text);
			// At an event the Driver Station writes the match into this text stream
			// when FMS attaches, which beats guessing from the clock.
			const matchInfo = matchInfoFromDsEvents(result.entries);
			root.dsEventsInfo = matchInfo;
			root.meta = {
				startTime: result.startTime,
				eventCount: result.entries.length,
				matchInfo,
				/** The data log the robot was writing at the time, if it said. */
				dataLogName: wpilogNameFromDsEvents(texts),
			};
			root.preview = clip(describeDsEvents(result.entries));
			root.eventName = matchInfo.eventName;
			root.writtenAt = result.startTime ?? undefined;
			break;
		}

		case "code-zip": {
			const listing = readZip(data, keepCodeEntry);
			const prefix = stripCommonPrefix(listing.entries.map((e) => e.path));
			const codeFiles: CodeFile[] = listing.entries.map((entry) => ({
				path: entry.path.slice(prefix.length),
				size: entry.data.byteLength,
				text: entryText(entry.data) ?? undefined,
			}));
			const info = readRobotCode(codeFiles);
			root.meta = { robotCode: info, skipped: listing.skipped.slice(0, 50), truncated: listing.truncated };
			root.preview = clip(describeRobotCode(info));
			if (info.teamNumber) teamCandidates.push({ team: info.teamNumber, source: "robot-code" });
			for (const [index, entry] of listing.entries.entries()) {
				const childPath = entry.path.slice(prefix.length);
				const text = codeFiles[index].text;
				out.push({
					id: randomUUID(),
					parentId: rootId,
					path: childPath,
					kind: "text",
					size: entry.data.byteLength,
					data: entry.data,
					meta: null,
					preview: text != null ? clip(text) : null,
					links: [],
				});
			}
			break;
		}

		case "support-bundle": {
			const listing = readZip(data, keepBundleEntry);
			const prefix = stripCommonPrefix(listing.entries.map((e) => e.path));
			const bundleFiles: CodeFile[] = listing.entries.map((entry) => ({
				path: entry.path.slice(prefix.length),
				size: entry.data.byteLength,
				text: entryText(entry.data) ?? undefined,
			}));
			const team = teamFromSupportBundle(bundleFiles);
			root.meta = {
				bundle: { fileCount: bundleFiles.length, team: team?.team ?? null, teamFrom: team?.from ?? null },
				skipped: listing.skipped.slice(0, 50),
				truncated: listing.truncated,
			};
			root.preview = clip(
				[
					`SystemCore support bundle, ${bundleFiles.length} files.`,
					team ? `Team ${team.team}, from ${team.from}.` : "No team number found in the bundle.",
					"",
					...bundleFiles.slice(0, 200).map((f) => `  ${f.path} (${f.size} B)`),
				].join("\n"),
			);
			if (team) teamCandidates.push({ team: team.team, source: "support-bundle" });
			for (const [index, entry] of listing.entries.entries()) {
				const text = bundleFiles[index].text;
				out.push({
					id: randomUUID(),
					parentId: rootId,
					path: entry.path.slice(prefix.length),
					kind: text != null ? "text" : "other",
					size: entry.data.byteLength,
					data: entry.data,
					meta: null,
					preview: text != null ? clip(text) : null,
					links: [],
				});
			}
			break;
		}

		case "hoot": {
			// The format is closed, so the only way in is CTRE's own converter, and
			// a failure here is a stored file with an explanation rather than a lost
			// upload. Phoenix names the file after the match, which is the only
			// place a Hoot says which match it came from.
			const compliancy = hootCompliancy(data);
			const name = parseHootFileName(path);
			root.hootName = name;
			root.eventName = name?.eventName;
			// The name's time is the driving laptop's local clock with no zone, so
			// it is only good enough to pick a day, which is all event inference needs.
			root.writtenAt = name ? Date.parse(`${name.startedAtLocal}Z`) / 1000 : undefined;

			if (!hootDecodeEnabled()) {
				root.meta = { hoot: { compliancy, converted: false }, fileName: name };
				root.preview =
					"CTRE signal log. Decoding Hoot logs is switched off on this server, so the file is stored as it came.";
				warnings.push(`${path}: stored without decoding, because Hoot decoding is switched off.`);
				break;
			}
			try {
				const converted = await convertHoot(data, path);
				const summary = readWpilog(converted.wpilog);
				// The converted log is enormous: a 13.7 MB Hoot expands to about
				// 250 MB of data log. So it is read for what it says and thrown away,
				// and converted again on demand when somebody asks for a signal.
				root.meta = {
					hoot: {
						compliancy: converted.compliancy,
						owletVersion: converted.owletVersion,
						busName: converted.busName,
						phoenixVersion: converted.phoenixVersion,
						pro: converted.pro,
						converted: true,
						convertedBytes: converted.wpilog.byteLength,
					},
					fileName: name,
					durationSecs: summary.durationSecs,
					recordCount: summary.recordCount,
					recordsTruncated: summary.recordsTruncated,
					entryCount: summary.entries.length,
					entries: summary.entries.slice(0, 500).map((e) => ({ name: e.name, type: e.type, count: e.count })),
				};
				root.preview = clip(
					[
						`CTRE signal log from the ${converted.busName ?? "unnamed"} bus, Phoenix ${converted.phoenixVersion ?? "unknown"}, compliancy ${converted.compliancy}, converted with ${converted.owletVersion}.`,
						converted.pro === false ? "Holds non-Pro devices, so fewer signals were recorded." : null,
						name ? `Named for ${name.matchLevel} ${name.matchNumber} at ${name.eventName}.` : null,
						`${summary.entries.length} signals, ${summary.recordCount.toLocaleString()} records, ${summary.durationSecs.toFixed(1)} s.`,
						"",
						"Signals:",
						...summary.entries.slice(0, 200).map((e) => `  ${e.name}  (${e.type}, ${e.count} samples)`),
						summary.entries.length > 200 ? `  ... ${summary.entries.length - 200} more` : "",
					]
						.filter((line) => line !== null && line !== "")
						.join("\n"),
				);
			} catch (err) {
				const message = err instanceof HootError ? err.message : "The Hoot log could not be converted.";
				root.meta = { hoot: { compliancy, converted: false, problem: message }, fileName: name };
				root.preview = `CTRE signal log. ${message}`;
				warnings.push(`${path}: ${message}`);
			}
			break;
		}

		case "csv": {
			const text = entryText(data) ?? "";
			const csv = readCsvTelemetry(text);
			root.meta = {
				csv: {
					parsed: csv.parsed,
					shape: csv.shape,
					timeColumn: csv.timeColumn,
					absoluteTime: csv.absoluteTime,
					rowCount: csv.rowCount,
					problem: csv.problem ?? null,
					series: csv.series.slice(0, 200).map((s) => ({
						label: s.label,
						count: s.points.length,
						min: Math.min(...s.points.map((p) => p.v)),
						max: Math.max(...s.points.map((p) => p.v)),
					})),
				},
			};
			root.preview = clip(describeCsvTelemetry(csv));
			if (!csv.parsed) warnings.push(`${path}: ${csv.problem ?? "not a readable telemetry CSV"}.`);
			// Only a wall clock can be lined up with a match.
			if (csv.parsed && csv.absoluteTime) {
				const times = csv.series.flatMap((s) => s.points.map((p) => p.t));
				const from = Math.min(...times);
				const to = Math.max(...times);
				if (Number.isFinite(from)) {
					root.csvRange = { from, to };
					root.writtenAt = from;
				}
			}
			break;
		}

		case "text": {
			const text = entryText(data);
			root.preview = text != null ? clip(text) : null;
			break;
		}

		case "zip":
		case "other":
			break;
	}

	return out;
}

/**
 * Take one submission all the way in: store the bytes, parse what we can, link
 * the matches, and decide which team it belongs to.
 */
export async function ingestUpload(params: IngestParams): Promise<IngestResult> {
	const warnings: string[] = [];
	const incoming = params.files.filter((f) => f.data.byteLength > 0 || hasAcceptedExtension(f.fileName));
	if (incoming.length === 0) throw new Error("No files were uploaded.");
	if (incoming.length > MAX_FILES_PER_UPLOAD) {
		throw new UploadTooLargeError(`Upload up to ${MAX_FILES_PER_UPLOAD} files at a time.`);
	}
	const total = incoming.reduce((sum, f) => sum + f.data.byteLength, 0);
	if (total > MAX_UPLOAD_BYTES) {
		throw new UploadTooLargeError(`That is ${Math.round(total / 1024 / 1024)} MB in one go. Split it up.`);
	}
	for (const file of incoming) {
		if (!hasAcceptedExtension(file.fileName)) {
			warnings.push(`${file.fileName}: stored, but not a file type we know how to read.`);
		}
	}

	const teamCandidates: { team: number; source: TeamSource }[] = [];
	if (params.enteredTeam) teamCandidates.push({ team: params.enteredTeam, source: "entered" });

	// Parse first, and link nothing yet: which event this belongs to is not known
	// until every file has been read, because the answer is inside the files.
	const prepared: PreparedFile[] = [];
	for (const file of incoming) {
		try {
			prepared.push(...(await prepareFile(file, warnings, teamCandidates)));
		} catch (err) {
			// One unreadable file must not take the submission down.
			warnings.push(
				`${file.fileName}: could not be read (${err instanceof Error ? err.message : "unknown error"}).`,
			);
			prepared.push({
				id: randomUUID(),
				parentId: null,
				path: file.fileName.replace(/^.*[/\\]/, ""),
				kind: "other",
				size: file.data.byteLength,
				data: file.data,
				meta: null,
				preview: null,
				links: [],
			});
		}
	}

	// #region which event is this
	let event: { code: string; name?: string } | null = params.event ? { code: params.event.code } : null;
	let eventWhy: string | null = params.event ? "Chosen by the volunteer who uploaded it." : null;
	const teamBeforeLinking = pickTeam(teamCandidates);
	const writtenAt = prepared.map((f) => f.writtenAt).filter((t): t is number => typeof t === "number" && t > 0);
	const logDate = writtenAt.length > 0 ? new Date(Math.min(...writtenAt) * 1000) : null;

	if (!event) {
		const guess = await inferEvent({
			// A name from the file itself, most specific first.
			eventNames: [...new Set(prepared.map((f) => f.eventName).filter((n): n is string => !!n))],
			team: teamBeforeLinking?.team ?? null,
			logDate,
		});
		if (guess) {
			event = { code: guess.code, name: guess.name };
			eventWhy = guess.why;
		} else {
			warnings.push(UNASSIGNED_REASON);
		}
	}
	// #endregion

	const candidates = await candidateMatches(event?.code);

	// #region link each file to its match
	for (const file of prepared) {
		if (file.kind === "wpilog" && file.wpilogMatch) {
			const link =
				linkByMatchInfo(file.wpilogMatch, candidates) ??
				(file.wpilogName ? linkByFileName(file.wpilogName, candidates) : null);
			if (link) {
				file.links.push(link);
				if (link.team) teamCandidates.push({ team: link.team, source: "log-station" });
			} else if (file.wpilogMatch.matchNumber && candidates.length > 0) {
				warnings.push(
					`${file.path}: the log says match ${file.wpilogMatch.matchNumber}, but this event has no station log for that match.`,
				);
			}
		} else if (file.kind === "hoot" && file.hootName) {
			const link = linkByMatchNumber(
				file.hootName.matchLevel,
				file.hootName.matchNumber,
				candidates,
				"file-name",
				`Phoenix named this log ${file.hootName.matchLevel} ${file.hootName.matchNumber} at ${file.hootName.eventName}.`,
			);
			if (link) file.links.push(link);
		} else if (file.kind === "dsevents" && file.dsEventsInfo) {
			const fromEvents = linkByMatchNumber(
				levelFromDsEvents(file.dsEventsInfo.matchType) ?? undefined,
				file.dsEventsInfo.matchNumber,
				candidates,
				"ds-events",
				`The Driver Station logged "FMS Connected: ${file.dsEventsInfo.matchType} - ${file.dsEventsInfo.matchNumber}".`,
			);
			if (fromEvents) {
				file.links.push(fromEvents);
			} else if (file.writtenAt) {
				const last = (file.meta as { eventCount?: number } | null)?.eventCount ?? 0;
				file.links.push(...linkByTimestamp(file.writtenAt, last, candidates));
			}
		} else if (file.kind === "dslog" && file.dsResult?.startTime) {
			const summary = summarizeDsLog(file.dsResult);
			file.links.push(...linkByTimestamp(file.dsResult.startTime, summary?.durationSecs ?? 0, candidates));
		} else if (file.kind === "csv" && file.csvRange) {
			file.links.push(
				...linkByTimestamp(file.csvRange.from, Math.max(file.csvRange.to - file.csvRange.from, 0), candidates),
			);
		}
	}

	// A `.dslog` and its `.dsevents` are one session under one name, and only the
	// events file knows the match. So the pair is matched up by base name, and the
	// telemetry log inherits the match its own binary never recorded.
	const baseName = (path: string) => path.replace(/\.(dslog|dsevents)$/i, "").toLowerCase();
	const infoByBase = new Map<string, DsEventsMatchInfo>();
	for (const file of prepared) {
		if (file.kind === "dsevents" && file.dsEventsInfo?.matchNumber)
			infoByBase.set(baseName(file.path), file.dsEventsInfo);
	}
	for (const file of prepared) {
		if (file.kind !== "dslog") continue;
		const info = infoByBase.get(baseName(file.path));
		if (info) {
			const link = linkByMatchNumber(
				levelFromDsEvents(info.matchType) ?? undefined,
				info.matchNumber,
				candidates,
				"ds-events",
				`Its matching events file logged "FMS Connected: ${info.matchType} - ${info.matchNumber}".`,
			);
			// The events file is the better evidence, so it replaces any clock guess.
			if (link) file.links = [link];
		}
		// Every attached match gets its own window, because one session covers the
		// pits as well and a pit brownout is not this match's lowest voltage.
		if (file.dsResult?.parsed && file.dsResult.startTime !== null && file.links.length > 0) {
			const startTime = file.dsResult.startTime;
			const windows = file.links
				.map((link) => {
					const offsetSecs = link.startTime.getTime() / 1000 - startTime;
					const summary = summarizeDsLogWindow(file.dsResult!, offsetSecs);
					return summary
						? {
								matchId: link.matchId,
								level: link.level,
								matchNumber: link.matchNumber,
								playNumber: link.playNumber,
								summary,
							}
						: null;
				})
				.filter((w) => w !== null);
			if (windows.length > 0) {
				file.meta = { ...(file.meta ?? {}), matchWindows: windows };
				file.preview = clip(
					[
						file.preview ?? "",
						"",
						...windows.map((w) =>
							[
								`--- ${w.level} ${w.matchNumber}${w.playNumber > 1 ? ` play ${w.playNumber}` : ""} only ---`,
								describeDsLog(w.summary, null),
							].join("\n"),
						),
					].join("\n"),
				);
			}
		}
	}
	// #endregion

	const notesScreen = screenForInstructions(params.notes);
	// `events` has no surrogate key; the FMS event GUID only exists on match log
	// rows, so it is carried over from one of them when this event has any.
	const eventId =
		event && candidates.length > 0
			? ((await db.query.matchLogs.findFirst({ where: eq(matchLogs.event, event.code) }))?.event_id ?? null)
			: null;
	const code = await uniqueCode();
	const uploadId = randomUUID();

	await db
		.insert(teamUploads)
		.values({
			id: uploadId,
			code,
			event: event?.code ?? null,
			event_id: eventId,
			event_why: eventWhy,
			team: null,
			team_source: "none",
			source: params.source,
			uploaded_by: params.uploadedBy ?? null,
			uploader_name: params.uploaderName?.slice(0, 120) ?? null,
			notes: params.notes?.slice(0, 4000) ?? null,
			notes_withheld: notesScreen.suspicious,
			ip_hash: params.ipHash ?? null,
		})
		.execute();

	const storedFiles: IngestResult["files"] = [];
	for (const file of prepared) {
		let stored: { content: string | null; gcs_path: string | null };
		try {
			stored = await storeBytes(uploadId, file.id, file.path, file.data);
		} catch (err) {
			// One file that will not store must not lose the others. A team sending
			// four files and a broken bucket should still get three of them.
			const why =
				err instanceof UploadTooLargeError
					? err.message
					: `${file.path} could not be stored: ${err instanceof Error ? err.message : "unknown error"}`;
			console.error("[uploads] could not store", file.path, err);
			warnings.push(why);
			continue;
		}
		await db
			.insert(teamUploadFiles)
			.values({
				id: file.id,
				upload_id: uploadId,
				parent_id: file.parentId,
				path: file.path,
				kind: file.kind,
				size: file.size,
				content: stored.content,
				gcs_path: stored.gcs_path,
				meta: file.meta,
				text_preview: file.preview,
			})
			.execute();
		storedFiles.push({ id: file.id, path: file.path, kind: file.kind, size: file.size });
	}

	const storedIds = new Set(storedFiles.map((f) => f.id));
	const allLinks: MatchLink[] = [];
	for (const file of prepared) {
		if (!storedIds.has(file.id)) continue;
		for (const link of file.links) {
			await db
				.insert(teamUploadMatches)
				.values({
					upload_id: uploadId,
					file_id: file.id,
					match_id: link.matchId,
					level: link.level,
					match_number: link.matchNumber,
					play_number: link.playNumber,
					station: link.station ?? null,
					team: link.team ?? null,
					how: link.how,
					reason: link.reason,
				})
				.onConflictDoNothing()
				.execute();
			allLinks.push(link);
		}
	}

	const team = pickTeam(teamCandidates);
	if (team) {
		await db
			.update(teamUploads)
			.set({ team: team.team, team_source: team.source })
			.where(eq(teamUploads.id, uploadId))
			.execute();
	} else {
		warnings.push("We could not work out which team this is. A volunteer can set it.");
	}

	return {
		id: uploadId,
		code,
		event: event?.code ?? null,
		eventWhy,
		team: team?.team ?? null,
		teamSource: team?.source ?? "none",
		files: storedFiles,
		matches: allLinks,
		warnings,
	};
}

/** Set the team by hand, for when detection got it wrong or found nothing. */
export async function setUploadTeam(uploadId: string, team: number | null): Promise<void> {
	await db
		.update(teamUploads)
		.set({ team, team_source: team === null ? "none" : "entered" })
		.where(eq(teamUploads.id, uploadId))
		.execute();
}

/** Attach or detach a match by hand. */
export async function linkUploadMatch(params: { uploadId: string; fileId: string; matchId: string }): Promise<void> {
	const match = await db.query.matchLogs.findFirst({ where: eq(matchLogs.id, params.matchId) });
	if (!match) throw new Error("Match not found");
	await db
		.insert(teamUploadMatches)
		.values({
			upload_id: params.uploadId,
			file_id: params.fileId,
			match_id: params.matchId,
			level: match.level,
			match_number: match.match_number,
			play_number: match.play_number,
			how: "manual",
			reason: "Attached by a volunteer.",
		})
		.onConflictDoNothing()
		.execute();
}

export async function unlinkUploadMatch(uploadId: string, matchId: string): Promise<void> {
	await db
		.delete(teamUploadMatches)
		.where(and(eq(teamUploadMatches.upload_id, uploadId), eq(teamUploadMatches.match_id, matchId)))
		.execute();
}

/** Files of an upload, newest first, without their bytes. */
export async function uploadFileRows(uploadId: string) {
	return db
		.select({
			id: teamUploadFiles.id,
			parent_id: teamUploadFiles.parent_id,
			path: teamUploadFiles.path,
			kind: teamUploadFiles.kind,
			size: teamUploadFiles.size,
			meta: teamUploadFiles.meta,
			has_text: teamUploadFiles.text_preview,
		})
		.from(teamUploadFiles)
		.where(eq(teamUploadFiles.upload_id, uploadId))
		.execute();
}

export async function filesByIds(ids: string[]) {
	if (ids.length === 0) return [];
	return db.select().from(teamUploadFiles).where(inArray(teamUploadFiles.id, ids)).execute();
}

/**
 * File an upload under an event after the fact, and link whatever its logs say
 * to that event's matches. This is the escape hatch for the cases inference
 * cannot settle: a bench log with no team number, or a team that has not played
 * a match yet.
 */
export async function assignUploadToEvent(uploadId: string, eventCode: string, why: string): Promise<void> {
	const eventId = (await db.query.matchLogs.findFirst({ where: eq(matchLogs.event, eventCode) }))?.event_id ?? null;
	await db
		.update(teamUploads)
		.set({ event: eventCode, event_id: eventId, event_why: why })
		.where(eq(teamUploads.id, uploadId))
		.execute();

	// Re-link from what we already parsed: the stored metadata holds the match
	// info, so nothing has to be read from storage again.
	const candidates = await candidateMatches(eventCode);
	if (candidates.length === 0) return;
	const files = await db.select().from(teamUploadFiles).where(eq(teamUploadFiles.upload_id, uploadId)).execute();
	for (const file of files) {
		const meta = file.meta as {
			match?: WpilogMatchInfo;
			matchInfo?: DsEventsMatchInfo;
			fileName?: { matchLevel?: MatchLevel; matchNumber?: number };
		} | null;
		const links: MatchLink[] = [];
		if (file.kind === "wpilog" && meta?.match) {
			const link = linkByMatchInfo(meta.match, candidates);
			if (link) links.push(link);
		}
		if (file.kind === "dsevents" && meta?.matchInfo) {
			const link = linkByMatchNumber(
				levelFromDsEvents(meta.matchInfo.matchType) ?? undefined,
				meta.matchInfo.matchNumber,
				candidates,
				"ds-events",
				`The Driver Station logged "FMS Connected: ${meta.matchInfo.matchType} - ${meta.matchInfo.matchNumber}".`,
			);
			if (link) links.push(link);
		}
		if (file.kind === "hoot" && meta?.fileName?.matchNumber) {
			const link = linkByMatchNumber(
				meta.fileName.matchLevel,
				meta.fileName.matchNumber,
				candidates,
				"file-name",
				`Phoenix named this log ${meta.fileName.matchLevel} ${meta.fileName.matchNumber}.`,
			);
			if (link) links.push(link);
		}
		for (const link of links) {
			await db
				.insert(teamUploadMatches)
				.values({
					upload_id: uploadId,
					file_id: file.id,
					match_id: link.matchId,
					level: link.level,
					match_number: link.matchNumber,
					play_number: link.playNumber,
					station: link.station ?? null,
					team: link.team ?? null,
					how: link.how,
					reason: link.reason,
				})
				.onConflictDoNothing()
				.execute();
		}
	}
}
