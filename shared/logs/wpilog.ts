/**
 * WPILOG (WPILib data log) reader.
 *
 * The record layout below follows allwpilib's `wpiutil` data log spec and
 * AdvantageScope's `WPILOGDecoder` (BSD, Littleton Robotics). We only need three
 * things out of a team's log, so this makes one pass and keeps only what it
 * recognises: which match the log belongs to, the text the robot printed, and a
 * listing of entries the assistant can ask about later.
 *
 * Everything here is pure TypeScript with no dependencies so the app can parse a
 * log in the browser and the server can parse the same bytes on upload.
 */

const HEADER_STRING = "WPILOG";
const HEADER_VERSION = 0x0100;
const CONTROL_ENTRY = 0;
const CONTROL_START = 0;
const CONTROL_FINISH = 1;
const CONTROL_SET_METADATA = 2;

/**
 * Stop before a hostile or corrupt file can spin the loop forever. A real
 * AdvantageKit log runs about 1.5 M records for ten minutes; a Hoot log
 * converted by owlet is far denser, so this has to clear that too.
 */
const MAX_RECORDS = 24_000_000;
/** Distinct entries we keep in the listing. A real log has a few hundred. */
const MAX_ENTRIES = 4000;
/** Text lines kept for the preview and for the assistant. */
const MAX_MESSAGES = 1000;

const decoder = new TextDecoder("utf-8");

export interface WpilogEntryInfo {
	/** Entry name as written by the robot, e.g. `NT:/FMSInfo/EventName`. */
	name: string;
	/** WPILib type string, e.g. `double`, `int64`, `string`, `string[]`, `structschema`. */
	type: string;
	metadata: string;
	/** Data records seen for this entry. */
	count: number;
	firstTimestamp: number | null;
	lastTimestamp: number | null;
}

export interface WpilogMessage {
	/** Microseconds since the log started. */
	timestamp: number;
	entry: string;
	text: string;
}

/**
 * Match identity as the robot recorded it. `matchType` is WPILib's enum ordinal:
 * 0 none, 1 practice, 2 qualification, 3 elimination. Same in 2026 and 2027.
 */
export interface WpilogMatchInfo {
	eventName?: string;
	matchType?: number;
	matchNumber?: number;
	replayNumber?: number;
	/** 1 to 3. Combined with the alliance this identifies the driver station. */
	stationNumber?: number;
	isRedAlliance?: boolean;
	/** Which NT table the values came from, which also tells us the writer. */
	source?: "FMSInfo" | "DriverStation" | "AdvantageKit/DriverStation";
}

export interface WpilogSummary {
	valid: boolean;
	/** `1.0` style version string, or null when the header did not parse. */
	version: string | null;
	/** JSON the writer put in the header, usually `{"systemTime":...}`. */
	extraHeader: string;
	recordCount: number;
	entries: WpilogEntryInfo[];
	/** True when the entry listing hit its cap, so `entries` is incomplete. */
	entriesTruncated: boolean;
	/** Log duration in seconds, from the first to the last data record. */
	durationSecs: number;
	/** True when the record cap was reached, so the tail was not read. */
	recordsTruncated: boolean;
	match: WpilogMatchInfo;
	messages: WpilogMessage[];
	messagesTruncated: boolean;
	/** Stopped early because the file is corrupt from this point on. */
	stoppedEarly: boolean;
}

/**
 * Match info lives in NetworkTables, which DataLogManager records by default
 * under the `NT:` prefix. Three tables carry it, and a real log can hold more
 * than one:
 *
 * - `/FMSInfo` is where WPILib 2026 and earlier publish it.
 * - `/DriverStation` is the same table after the 2027 rewrite renamed it.
 * - `/AdvantageKit/DriverStation` is AdvantageKit's own copy, which is what a
 *   log from an AdvantageKit robot actually contains, and plenty of teams run
 *   AdvantageKit. It names the driver station differently: one
 *   `AllianceStation` value from WPILib's `AllianceStationID` enum rather than
 *   a station number and an alliance flag.
 */
const MATCH_TABLES = ["FMSInfo", "DriverStation", "AdvantageKit/DriverStation"] as const;
type MatchTable = (typeof MATCH_TABLES)[number];

const MATCH_LEAVES = [
	"EventName",
	"MatchNumber",
	"MatchType",
	"ReplayNumber",
	"StationNumber",
	"IsRedAlliance",
	"AllianceStation",
] as const;

/** `AllianceStationID`: Unknown, Red1, Red2, Red3, Blue1, Blue2, Blue3. */
export function stationFromAllianceStationId(value: number): { stationNumber: number; isRedAlliance: boolean } | null {
	if (value < 1 || value > 6) return null;
	return { stationNumber: ((value - 1) % 3) + 1, isRedAlliance: value <= 3 };
}

function matchLeafFor(name: string): { table: MatchTable; leaf: string } | null {
	if (!name.startsWith("NT:/")) return null;
	const rest = name.slice(4);
	// Longest table first, so `AdvantageKit/DriverStation` is not read as the
	// bare `DriverStation` table with a `DriverStation/...` leaf.
	for (const table of [...MATCH_TABLES].sort((a, b) => b.length - a.length)) {
		if (!rest.startsWith(`${table}/`)) continue;
		const leaf = rest.slice(table.length + 1);
		if (!MATCH_LEAVES.includes(leaf as (typeof MATCH_LEAVES)[number])) return null;
		return { table, leaf };
	}
	return null;
}

/**
 * Where the robot's own text ends up. `DataLogManager.log()` writes `messages`;
 * AdvantageKit captures the console to `console`, which is what a real
 * AdvantageKit log actually contains, and it is the more useful of the two.
 */
function isMessageEntry(name: string, type: string): boolean {
	if (type === "string" && (name === "messages" || name === "NT:/messages" || name === "console")) return true;
	// The WPILib Alerts class publishes string arrays under a table the team names.
	if (type === "string[]" && /\/(errors|warnings)$/.test(name)) return true;
	return false;
}

class Reader {
	private view: DataView;

	constructor(private data: Uint8Array) {
		this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	}

	u8(pos: number): number {
		return this.view.getUint8(pos);
	}

	u16(pos: number): number {
		return this.view.getUint16(pos, true);
	}

	u32(pos: number): number {
		return this.view.getUint32(pos, true);
	}

	/** Little-endian integer of 1 to 8 bytes, sign applied on the last byte. */
	varInt(pos: number, length: number): number {
		let value = 0n;
		const n = Math.min(8, length);
		for (let i = 0; i < n; i++) {
			let byte = this.data[pos + i];
			if (i === 7) {
				if ((byte & 0x80) !== 0) value -= 1n << 63n;
				byte &= 0x7f;
			}
			value |= BigInt(byte) << BigInt(i * 8);
		}
		return Number(value);
	}

	/** String written as a u32 length followed by utf-8 bytes. */
	innerString(pos: number): { value: string; next: number } | null {
		if (pos + 4 > this.data.length) return null;
		const size = this.u32(pos);
		const end = pos + 4 + size;
		if (size < 0 || end > this.data.length) return null;
		return { value: decoder.decode(this.data.subarray(pos + 4, end)), next: end };
	}

	slice(start: number, end: number): Uint8Array {
		return this.data.subarray(start, end);
	}

	get length(): number {
		return this.data.length;
	}
}

interface RawRecord {
	entry: number;
	timestamp: number;
	start: number;
	end: number;
	size: number;
}

/** Returns true when the bytes begin with a data log header we can read. */
export function isWpilog(data: Uint8Array): boolean {
	if (data.length < 12) return false;
	if (decoder.decode(data.subarray(0, 6)) !== HEADER_STRING) return false;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	return view.getUint16(6, true) === HEADER_VERSION;
}

/** Iterate the records in a log. Yields nothing when the header is invalid. */
function* records(r: Reader): Generator<RawRecord> {
	let pos = 12 + r.u32(8);
	for (let i = 0; i < MAX_RECORDS; i++) {
		if (pos + 4 > r.length) return;
		const bitfield = r.u8(pos);
		const entryLength = (bitfield & 0x3) + 1;
		const sizeLength = ((bitfield >> 2) & 0x3) + 1;
		const timestampLength = ((bitfield >> 4) & 0x7) + 1;
		const headerLength = 1 + entryLength + sizeLength + timestampLength;
		if (pos + headerLength > r.length) return;
		const entry = r.varInt(pos + 1, entryLength);
		const size = r.varInt(pos + 1 + entryLength, sizeLength);
		const timestamp = r.varInt(pos + 1 + entryLength + sizeLength, timestampLength);
		if (entry < 0 || size < 0 || pos + headerLength + size > r.length) return;
		const start = pos + headerLength;
		yield { entry, timestamp, start, end: start + size, size };
		pos = start + size;
	}
}

function decodeString(r: Reader, rec: RawRecord): string {
	return decoder.decode(r.slice(rec.start, rec.end));
}

function decodeStringArray(r: Reader, rec: RawRecord): string[] {
	const out: string[] = [];
	if (rec.size < 4) return out;
	const count = r.u32(rec.start);
	let pos = rec.start + 4;
	for (let i = 0; i < count; i++) {
		const s = r.innerString(pos);
		if (!s || s.next > rec.end) break;
		out.push(s.value);
		pos = s.next;
	}
	return out;
}

function decodeInt(r: Reader, rec: RawRecord): number | null {
	if (rec.size !== 8) return null;
	return r.varInt(rec.start, 8);
}

function decodeBoolean(r: Reader, rec: RawRecord): boolean | null {
	if (rec.size !== 1) return null;
	return r.u8(rec.start) !== 0;
}

/**
 * Read a log. One pass, bounded work, and it never throws on bad bytes: a
 * truncated or corrupt file comes back with `stoppedEarly` set and whatever was
 * readable before that point, because half a log still tells a CSA something.
 */
export function readWpilog(data: Uint8Array): WpilogSummary {
	const empty: WpilogSummary = {
		valid: false,
		version: null,
		extraHeader: "",
		recordCount: 0,
		entries: [],
		entriesTruncated: false,
		durationSecs: 0,
		recordsTruncated: false,
		match: {},
		messages: [],
		messagesTruncated: false,
		stoppedEarly: false,
	};
	if (!isWpilog(data)) return empty;

	const r = new Reader(data);
	const version = `${(r.u16(6) >> 8) & 0xff}.${r.u16(6) & 0xff}`;
	const extraSize = r.u32(8);
	const extraHeader =
		extraSize > 0 && 12 + extraSize <= data.length ? decoder.decode(data.subarray(12, 12 + extraSize)) : "";

	/** Entry id to info. Ids are reused after a finish record, so this tracks the live ones. */
	const live = new Map<number, WpilogEntryInfo>();
	const byName = new Map<string, WpilogEntryInfo>();
	let entriesTruncated = false;
	const messages: WpilogMessage[] = [];
	let messagesTruncated = false;
	const match: WpilogMatchInfo = {};
	let recordCount = 0;
	// Duration comes from data records only. A control record carries the
	// writer's wall clock rather than log time: owlet stamps them with the epoch
	// while its data records count from the start of the log, so mixing the two
	// makes every converted Hoot look zero seconds long.
	let firstTs: number | null = null;
	let lastTs: number | null = null;
	let position = 12 + extraSize;

	for (const rec of records(r)) {
		recordCount++;
		position = rec.end;
		if (rec.entry !== CONTROL_ENTRY) {
			if (firstTs === null || rec.timestamp < firstTs) firstTs = rec.timestamp;
			if (lastTs === null || rec.timestamp > lastTs) lastTs = rec.timestamp;
		}

		if (rec.entry === CONTROL_ENTRY) {
			if (rec.size < 1) continue;
			const kind = r.u8(rec.start);
			if (kind === CONTROL_START) {
				const id = r.u32(rec.start + 1);
				const nameStr = r.innerString(rec.start + 5);
				if (!nameStr) continue;
				const typeStr = r.innerString(nameStr.next);
				if (!typeStr) continue;
				const metaStr = r.innerString(typeStr.next);
				const existing = byName.get(nameStr.value);
				const info: WpilogEntryInfo = existing ?? {
					name: nameStr.value,
					type: typeStr.value,
					metadata: metaStr?.value ?? "",
					count: 0,
					firstTimestamp: null,
					lastTimestamp: null,
				};
				if (!existing) {
					if (byName.size >= MAX_ENTRIES) {
						entriesTruncated = true;
					} else {
						byName.set(nameStr.value, info);
					}
				}
				live.set(id, info);
			} else if (kind === CONTROL_FINISH) {
				if (rec.size >= 5) live.delete(r.u32(rec.start + 1));
			} else if (kind === CONTROL_SET_METADATA) {
				if (rec.size >= 5) {
					const info = live.get(r.u32(rec.start + 1));
					const metaStr = r.innerString(rec.start + 5);
					if (info && metaStr) info.metadata = metaStr.value;
				}
			}
			continue;
		}

		const info = live.get(rec.entry);
		if (!info) continue;
		info.count++;
		if (info.firstTimestamp === null) info.firstTimestamp = rec.timestamp;
		info.lastTimestamp = rec.timestamp;

		const leaf = matchLeafFor(info.name);
		if (leaf) {
			// Last value wins: FMS can correct the match info after the first packet,
			// and a replay bumps ReplayNumber part way through a log.
			if (leaf.leaf === "EventName" && info.type === "string") {
				const value = decodeString(r, rec).trim();
				if (value) {
					match.eventName = value;
					match.source = leaf.table;
				}
			} else if (info.type === "int64") {
				const value = decodeInt(r, rec);
				if (value !== null) {
					if (leaf.leaf === "MatchNumber" && value > 0) match.matchNumber = value;
					else if (leaf.leaf === "MatchType" && value > 0) match.matchType = value;
					else if (leaf.leaf === "ReplayNumber") match.replayNumber = value;
					else if (leaf.leaf === "StationNumber" && value >= 1 && value <= 3) match.stationNumber = value;
					else if (leaf.leaf === "AllianceStation") {
						const station = stationFromAllianceStationId(value);
						if (station) {
							match.stationNumber = station.stationNumber;
							match.isRedAlliance = station.isRedAlliance;
						}
					}
					if (leaf.leaf !== "ReplayNumber" && value > 0) match.source = leaf.table;
				}
			} else if (leaf.leaf === "IsRedAlliance" && info.type === "boolean") {
				const value = decodeBoolean(r, rec);
				if (value !== null) match.isRedAlliance = value;
			}
			continue;
		}

		if (isMessageEntry(info.name, info.type)) {
			if (messages.length >= MAX_MESSAGES) {
				messagesTruncated = true;
				continue;
			}
			if (info.type === "string") {
				const text = decodeString(r, rec).trim();
				if (text) messages.push({ timestamp: rec.timestamp, entry: info.name, text });
			} else {
				for (const text of decodeStringArray(r, rec)) {
					if (messages.length >= MAX_MESSAGES) {
						messagesTruncated = true;
						break;
					}
					if (text.trim()) messages.push({ timestamp: rec.timestamp, entry: info.name, text: text.trim() });
				}
			}
		}
	}

	const entries = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
	return {
		valid: true,
		version,
		extraHeader,
		recordCount,
		recordsTruncated: recordCount >= MAX_RECORDS,
		entries,
		entriesTruncated,
		durationSecs: firstTs === null || lastTs === null ? 0 : Math.max(0, (lastTs - firstTs) / 1e6),
		match,
		messages,
		messagesTruncated,
		stoppedEarly: position < data.length,
	};
}

export interface WpilogSample {
	timestamp: number;
	value: string;
}

/**
 * Read the samples of one entry by name, for the assistant's `read_log_entry`
 * tool. Values come back as strings because the caller puts them in a prompt.
 */
export function readWpilogEntry(data: Uint8Array, name: string, limit = 500): WpilogSample[] {
	if (!isWpilog(data)) return [];
	const r = new Reader(data);
	const ids = new Set<number>();
	let type = "";
	const out: WpilogSample[] = [];
	for (const rec of records(r)) {
		if (rec.entry === CONTROL_ENTRY) {
			if (rec.size < 1) continue;
			const kind = r.u8(rec.start);
			if (kind === CONTROL_START) {
				const id = r.u32(rec.start + 1);
				const nameStr = r.innerString(rec.start + 5);
				const typeStr = nameStr ? r.innerString(nameStr.next) : null;
				if (nameStr?.value === name) {
					ids.add(id);
					type = typeStr?.value ?? "";
				}
			} else if (kind === CONTROL_FINISH && rec.size >= 5) {
				ids.delete(r.u32(rec.start + 1));
			}
			continue;
		}
		if (!ids.has(rec.entry)) continue;
		let value: string;
		switch (type) {
			case "boolean":
				value = String(decodeBoolean(r, rec));
				break;
			case "int64":
				value = String(decodeInt(r, rec));
				break;
			case "float":
				value =
					rec.size === 4
						? String(new DataView(data.buffer, data.byteOffset + rec.start, 4).getFloat32(0, true))
						: "?";
				break;
			case "double":
				value =
					rec.size === 8
						? String(new DataView(data.buffer, data.byteOffset + rec.start, 8).getFloat64(0, true))
						: "?";
				break;
			case "string":
				value = decodeString(r, rec);
				break;
			case "string[]":
				value = decodeStringArray(r, rec).join(", ");
				break;
			default:
				value = `<${rec.size} bytes>`;
		}
		out.push({ timestamp: rec.timestamp, value });
		if (out.length >= limit) break;
	}
	return out;
}

/**
 * Sum several numeric entries into one series, in a single pass.
 *
 * Total current has to add up a dozen motor controllers, and reading the file
 * once per entry means a dozen passes over what can be tens of megabytes. Each
 * device reports on its own schedule, so the sum holds every device's last
 * reading and re-adds at each new sample; a device that has not reported yet
 * contributes nothing rather than a zero it never sent.
 */
export function sumWpilogEntries(
	data: Uint8Array,
	matches: (name: string) => boolean,
	limit = 40_000,
): { points: { timestamp: number; value: number }[]; names: string[] } {
	if (!isWpilog(data)) return { points: [], names: [] };
	const r = new Reader(data);
	const types = new Map<number, string>();
	const names = new Map<number, string>();
	const last = new Map<number, number>();
	const points: { timestamp: number; value: number }[] = [];

	for (const rec of records(r)) {
		if (rec.entry === CONTROL_ENTRY) {
			if (rec.size < 1) continue;
			const kind = r.u8(rec.start);
			if (kind === CONTROL_START) {
				const id = r.u32(rec.start + 1);
				const nameStr = r.innerString(rec.start + 5);
				const typeStr = nameStr ? r.innerString(nameStr.next) : null;
				const type = typeStr?.value ?? "";
				if (nameStr?.value && matches(nameStr.value) && (type === "double" || type === "float")) {
					types.set(id, type);
					names.set(id, nameStr.value);
				}
			} else if (kind === CONTROL_FINISH && rec.size >= 5) {
				const id = r.u32(rec.start + 1);
				types.delete(id);
				last.delete(id);
			}
			continue;
		}
		const type = types.get(rec.entry);
		if (!type) continue;
		let value: number;
		if (type === "double" && rec.size === 8) {
			value = new DataView(data.buffer, data.byteOffset + rec.start, 8).getFloat64(0, true);
		} else if (type === "float" && rec.size === 4) {
			value = new DataView(data.buffer, data.byteOffset + rec.start, 4).getFloat32(0, true);
		} else {
			continue;
		}
		if (!Number.isFinite(value)) continue;
		last.set(rec.entry, value);
		let sum = 0;
		for (const held of last.values()) sum += held;
		points.push({ timestamp: rec.timestamp, value: sum });
		if (points.length >= limit) break;
	}
	return { points, names: [...names.values()].sort() };
}

/**
 * Where a data log sits on the wall clock.
 *
 * A data log's own timestamps count microseconds from robot boot, which places
 * nothing. `DataLogManager` writes a `systemTime` entry (epoch microseconds)
 * about every five seconds for exactly this reason, so the first sample of it
 * gives the offset between log time and real time.
 *
 * Returns null when the log has no `systemTime`, which happens when the robot's
 * clock was never set. The caller must then refuse to plot rather than guess.
 */
export function wpilogClockOffset(data: Uint8Array): number | null {
	const samples = readWpilogEntry(data, "systemTime", 1);
	if (samples.length === 0) return null;
	const epochUs = Number(samples[0].value);
	if (!Number.isFinite(epochUs) || epochUs <= 0) return null;
	return (epochUs - samples[0].timestamp) / 1e6;
}
