/**
 * Driver Station log reader (`.dslog` and `.dsevents`).
 *
 * NI does not publish these formats. The layout here is the community
 * reverse-engineering, adapted from AdvantageScope's `DSLogReader` /
 * `DSEventsReader` (BSD, Littleton Robotics), which in turn follows
 * orangelight's DSLOG-Reader and the FRCture notes.
 *
 * Because the format is reverse-engineered, this fails closed: an unrecognised
 * version is reported as unparsed rather than guessed at. Inventing a battery
 * voltage is worse than saying the file could not be read.
 *
 * The `.dslog` binary carries no match number. The `.dsevents` text stream does
 * once FMS attaches, which `matchInfoFromDsEvents` reads; failing that, a log is
 * tied to a match by its start time against our schedule.
 */

const SUPPORTED_VERSION = 4;
const PERIOD_SECS = 0.02;
/** A 2:30 match at 50 Hz is 7,500 records. This is a whole day of logging. */
const MAX_RECORDS = 5_000_000;
const MAX_EVENTS = 20_000;

const decoder = new TextDecoder("utf-8");

export interface DsLogEntry {
	/** Seconds since the start of the log. */
	timestamp: number;
	tripTimeMs: number;
	/** 0 to 1. */
	packetLoss: number;
	batteryVolts: number;
	/** 0 to 1. */
	cpuUtilization: number;
	brownout: boolean;
	watchdog: boolean;
	dsTeleop: boolean;
	dsDisabled: boolean;
	robotTeleop: boolean;
	robotAuto: boolean;
	robotDisabled: boolean;
	/** 0 to 1. */
	canUtilization: number;
	wifiDb: number;
	wifiMb: number;
	powerDistributionCurrents: number[];
}

export interface DsEventsEntry {
	/** Seconds since the start of the log. */
	timestamp: number;
	text: string;
}

export enum PowerDistributionType {
	REV,
	CTRE,
	None,
}

/**
 * LabVIEW timestamps count from 1904-01-01 UTC, which is 2082844800 seconds
 * before the Unix epoch. The constant here used to be 18000 lower - a US Eastern
 * offset baked into what is a UTC-to-UTC conversion - so every Driver Station
 * log decoded five hours late. That is enough to put an evening session on the
 * next calendar day, and it moved every sample outside its own match window, so
 * a CSA was shown whole-session battery minimums instead of match ones.
 */
function convertLVTime(seconds: bigint, fractional: bigint): number {
	let time = -2082844800;
	time += Number(seconds);
	time += Number(fractional) / Math.pow(2, 64);
	return time;
}

function getPDType(id: number): PowerDistributionType {
	if (id === 33) return PowerDistributionType.REV;
	if (id === 25) return PowerDistributionType.CTRE;
	return PowerDistributionType.None;
}

function header(data: Uint8Array): { version: number; startTime: number } | null {
	if (data.length < 20) return null;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const version = view.getInt32(0);
	if (version !== SUPPORTED_VERSION) return null;
	return { version, startTime: convertLVTime(view.getBigInt64(4), view.getBigUint64(12)) };
}

export function isDsLog(data: Uint8Array): boolean {
	return header(data) !== null;
}

export interface DsLogResult {
	/** False when the version byte is not one we know how to read. */
	parsed: boolean;
	version: number | null;
	/** Unix seconds when the log started, from the DS clock. */
	startTime: number | null;
	entries: DsLogEntry[];
	/** True when the record loop stopped on bad bytes; earlier entries are still good. */
	stoppedEarly: boolean;
}

/**
 * Read a `.dslog`. Robot telemetry as the Driver Station saw it, one record
 * per control packet: the period is 20 ms, so the rate is 50 Hz.
 */
export function readDsLog(data: Uint8Array): DsLogResult {
	const head = header(data);
	if (!head) {
		const view = data.length >= 4 ? new DataView(data.buffer, data.byteOffset, data.byteLength) : null;
		return {
			parsed: false,
			version: view ? view.getInt32(0) : null,
			startTime: null,
			entries: [],
			stoppedEarly: false,
		};
	}
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const entries: DsLogEntry[] = [];
	let position = 4 + 8 + 8;
	let timestamp = 0;
	let lastBatteryVolts = 0;
	let stoppedEarly = false;

	try {
		for (let i = 0; i < MAX_RECORDS && position < data.length; i++) {
			const mask = view.getUint8(position + 5);
			let batteryVolts = view.getUint16(position + 2) / Math.pow(2, 8);
			if (batteryVolts > 20) {
				// The voltage sometimes spikes on the last record; carry the previous one.
				batteryVolts = lastBatteryVolts;
			} else {
				lastBatteryVolts = batteryVolts;
			}

			const entry: DsLogEntry = {
				timestamp,
				tripTimeMs: view.getUint8(position) * 0.5,
				packetLoss: Math.min(Math.max(view.getInt8(position + 1) * 4 * 0.01, 0), 1),
				batteryVolts,
				cpuUtilization: view.getUint8(position + 4) * 0.5 * 0.01,
				brownout: (mask & (1 << 7)) === 0,
				watchdog: (mask & (1 << 6)) === 0,
				dsTeleop: (mask & (1 << 5)) === 0,
				dsDisabled: (mask & (1 << 3)) === 0,
				robotTeleop: (mask & (1 << 2)) === 0,
				robotAuto: (mask & (1 << 1)) === 0,
				robotDisabled: (mask & 1) === 0,
				canUtilization: view.getUint8(position + 6) * 0.5 * 0.01,
				wifiDb: view.getUint8(position + 7) * 0.5,
				wifiMb: view.getUint16(position + 8) / Math.pow(2, 8),
				powerDistributionCurrents: [],
			};
			position += 10;

			const pdType = getPDType(view.getUint8(position + 3));
			position += 4;
			const currents: number[] = [];
			if (pdType === PowerDistributionType.REV) {
				position += 1; // CAN id
				const bits: boolean[] = [];
				data.subarray(position, position + 27).forEach((byte) => {
					for (let b = 0; b < 8; b++) bits.push((byte & (1 << b)) !== 0);
				});
				position += 27;
				for (let ch = 0; ch < 20; ch++) {
					const readPosition = Math.floor(ch / 3) * 32 + (ch % 3) * 10;
					let value = 0;
					for (let b = 0; b < 10; b++) value += bits[readPosition + b] ? Math.pow(2, b) : 0;
					currents.push(value / 8);
				}
				for (let ch = 0; ch < 4; ch++) currents[ch + 20] = data[position + ch] / 16;
				position += 4;
				position += 1; // trailing byte, believed to be temperature
			} else if (pdType === PowerDistributionType.CTRE) {
				position += 1; // CAN id
				const bits: boolean[] = [];
				data.subarray(position, position + 21).forEach((byte) => {
					for (let b = 0; b < 8; b++) bits.push((byte & (1 << b)) !== 0);
				});
				for (let ch = 0; ch < 16; ch++) {
					const readPosition = Math.floor(ch / 6) * 64 + (ch % 6) * 10;
					let value = 0;
					for (let b = 0; b < 8; b++) value += bits[readPosition + b] ? Math.pow(2, b) : 0;
					currents.push(value / 8);
				}
				position += 21 + 3;
			}
			entry.powerDistributionCurrents = currents;
			entries.push(entry);
			timestamp += PERIOD_SECS;
		}
	} catch {
		// Ran off the end of a truncated record. Keep what parsed.
		stoppedEarly = true;
	}

	return { parsed: true, version: head.version, startTime: head.startTime, entries, stoppedEarly };
}

export interface DsEventsResult {
	parsed: boolean;
	version: number | null;
	startTime: number | null;
	entries: DsEventsEntry[];
	stoppedEarly: boolean;
}

/** Tags the DS wraps around message text. They are noise in a chat answer. */
const EVENT_TAGS = ["<TagVersion>", "<time>", "<count>", "<flags>", "<Code>", "<location>", "<stack>"];

function cleanEventText(text: string): string {
	let out = text;
	for (const tag of EVENT_TAGS) {
		while (out.includes(tag)) {
			const tagIndex = out.indexOf(tag);
			const nextIndex = out.indexOf("<", tagIndex + 1);
			if (nextIndex < 0) {
				out = out.slice(0, tagIndex);
				break;
			}
			out = out.slice(0, tagIndex) + out.slice(nextIndex);
		}
	}
	return out.replaceAll("<message> ", "").replaceAll("<details> ", "").trim();
}

/** Read a `.dsevents`. This is the text side: brownouts, radio drops, robot errors. */
export function readDsEvents(data: Uint8Array): DsEventsResult {
	const head = header(data);
	if (!head) {
		const view = data.length >= 4 ? new DataView(data.buffer, data.byteOffset, data.byteLength) : null;
		return {
			parsed: false,
			version: view ? view.getInt32(0) : null,
			startTime: null,
			entries: [],
			stoppedEarly: false,
		};
	}
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const entries: DsEventsEntry[] = [];
	let position = 4 + 8 + 8;
	let stoppedEarly = false;

	for (let i = 0; i < MAX_EVENTS && position < data.length; i++) {
		if (position + 20 > data.length) {
			stoppedEarly = true;
			break;
		}
		const timestamp = convertLVTime(view.getBigInt64(position), view.getBigUint64(position + 8));
		position += 16;
		const length = view.getInt32(position);
		position += 4;
		if (length < 0 || position + length > data.length) {
			stoppedEarly = true;
			break;
		}
		const text = cleanEventText(decoder.decode(data.subarray(position, position + length)));
		position += length;
		if (text) entries.push({ timestamp: timestamp - head.startTime, text });
	}

	return { parsed: true, version: head.version, startTime: head.startTime, entries, stoppedEarly };
}

export interface DsLogSummary {
	durationSecs: number;
	sampleCount: number;
	minBatteryVolts: number | null;
	/** Lowest voltage seen while the robot was enabled, which is the number that matters. */
	minEnabledBatteryVolts: number | null;
	maxTripTimeMs: number;
	maxPacketLoss: number;
	maxCpuUtilization: number;
	maxCanUtilization: number;
	minWifiDb: number | null;
	/** Seconds of each condition, so "0.4 s of brownout" reads as one number. */
	brownoutSecs: number;
	watchdogSecs: number;
	enabledSecs: number;
	/** Windows where the robot was enabled but reported disabled, i.e. it dropped out. */
	dropouts: { startSecs: number; endSecs: number; durationSecs: number }[];
	/** Peak current per power distribution channel, empty when the log has no PD data. */
	peakChannelCurrents: number[];
}

/** Condense 50 Hz telemetry into the handful of numbers a CSA actually reads. */
export function summarizeDsLog(result: DsLogResult): DsLogSummary | null {
	if (!result.parsed || result.entries.length === 0) return null;
	const e = result.entries;
	let minBattery = Infinity;
	let minEnabledBattery = Infinity;
	let maxTrip = 0;
	let maxLoss = 0;
	let maxCpu = 0;
	let maxCan = 0;
	let minWifi = Infinity;
	let brownoutCount = 0;
	let watchdogCount = 0;
	let enabledCount = 0;
	const peaks: number[] = [];
	const dropouts: DsLogSummary["dropouts"] = [];
	let dropStart: number | null = null;

	for (const entry of e) {
		const enabled = entry.robotTeleop || entry.robotAuto;
		if (entry.batteryVolts > 0) minBattery = Math.min(minBattery, entry.batteryVolts);
		if (enabled && entry.batteryVolts > 0) minEnabledBattery = Math.min(minEnabledBattery, entry.batteryVolts);
		maxTrip = Math.max(maxTrip, entry.tripTimeMs);
		maxLoss = Math.max(maxLoss, entry.packetLoss);
		maxCpu = Math.max(maxCpu, entry.cpuUtilization);
		maxCan = Math.max(maxCan, entry.canUtilization);
		if (entry.wifiDb > 0) minWifi = Math.min(minWifi, entry.wifiDb);
		if (entry.brownout) brownoutCount++;
		if (entry.watchdog) watchdogCount++;
		if (enabled) enabledCount++;
		entry.powerDistributionCurrents.forEach((amps, i) => {
			peaks[i] = Math.max(peaks[i] ?? 0, amps);
		});

		// The DS asked for enabled but the robot reported disabled: a dropout.
		const dropped = !entry.dsDisabled && entry.robotDisabled;
		if (dropped && dropStart === null) dropStart = entry.timestamp;
		if (!dropped && dropStart !== null) {
			dropouts.push({
				startSecs: dropStart,
				endSecs: entry.timestamp,
				durationSecs: entry.timestamp - dropStart,
			});
			dropStart = null;
		}
	}
	if (dropStart !== null) {
		const last = e[e.length - 1].timestamp;
		dropouts.push({ startSecs: dropStart, endSecs: last, durationSecs: last - dropStart });
	}

	return {
		durationSecs: e[e.length - 1].timestamp,
		sampleCount: e.length,
		minBatteryVolts: Number.isFinite(minBattery) ? minBattery : null,
		minEnabledBatteryVolts: Number.isFinite(minEnabledBattery) ? minEnabledBattery : null,
		maxTripTimeMs: maxTrip,
		maxPacketLoss: maxLoss,
		maxCpuUtilization: maxCpu,
		maxCanUtilization: maxCan,
		minWifiDb: Number.isFinite(minWifi) ? minWifi : null,
		brownoutSecs: brownoutCount * PERIOD_SECS,
		watchdogSecs: watchdogCount * PERIOD_SECS,
		enabledSecs: enabledCount * PERIOD_SECS,
		dropouts: dropouts.filter((d) => d.durationSecs >= 0.1),
		peakChannelCurrents: peaks,
	};
}

/**
 * A log is one session of the Driver Station being connected to the robot, in
 * the pits as much as on the field, and it ends when that connection drops. So a
 * session can run either side of the match it contains, and a robot that power
 * cycles mid-match leaves two logs for the same match rather than one.
 *
 * A whole-file summary therefore answers "how has this team's day gone" and is
 * the wrong answer to "what happened in Q12": a pit brownout with nobody driving
 * would be reported as the match's lowest voltage. This windows the entries to
 * one match before summarising. `offsetSecs` is where match start falls on the
 * log's own clock, which is `matchStartUnixSecs - result.startTime`.
 */
export function summarizeDsLogWindow(
	result: DsLogResult,
	offsetSecs: number,
	leadSecs = 15,
	lengthSecs = 180,
): DsLogSummary | null {
	if (!result.parsed) return null;
	const from = offsetSecs - leadSecs;
	const to = offsetSecs + lengthSecs;
	const entries = result.entries.filter((e) => e.timestamp >= from && e.timestamp <= to);
	if (entries.length === 0) return null;
	// Re-zero the window on match start so every timestamp in the summary reads
	// as seconds into the match, which is how everyone talks about a match.
	const shifted = entries.map((e) => ({ ...e, timestamp: e.timestamp - offsetSecs }));
	return summarizeDsLog({ ...result, entries: shifted });
}

/**
 * Match info out of a `.dsevents` message stream.
 *
 * The Driver Station does not put match info in the `.dslog` binary, but at an
 * event it writes it into the event log as text when FMS attaches. The exact
 * strings, and the fact that the number is terminated by a colon, come from
 * orangelight's DSLOGMatchCollector, which exists to find match logs in a
 * folder of session logs:
 *
 *   Info  FMS Connected:   Qualification - 41: ...
 *   Info  FMS Event Name: Kettering University #1
 *   FMS Disconnect
 *
 * Spacing is matched loosely, because the run of spaces after the colon is
 * exactly the sort of thing a Driver Station release changes quietly.
 */
export interface DsEventsMatchInfo {
	matchType?: "Practice" | "Qualification" | "Elimination" | "None";
	matchNumber?: number;
	eventName?: string;
	/** True when anything in the log says FMS was attached at all. */
	fmsAttached: boolean;
}

const FMS_CONNECTED = /FMS Connected:\s*(Qualification|Elimination|Practice|None)\s*-\s*(\d+)/i;
const FMS_EVENT_NAME = /FMS Event Name:\s*(.+?)\s*$/i;
const FMS_ANY = /FMS (Connected|Event Name|Disconnect)|FMS-GOOD/i;

/**
 * Team number out of the addresses a `.dsevents` stream mentions.
 *
 * Everything on a team's network sits on 10.TE.AM.x, so any address the Driver
 * Station writes down - a NetworkTables client connecting, the robot it is
 * talking to - carries the team number in its middle two octets. This is the
 * only place a Driver Station log says whose it is: the `.dslog` binary has no
 * team field at all, and the text stream otherwise only names the match. Without
 * it a team who uploads nothing but their Driver Station logs cannot be
 * identified, which is exactly what the upload portal receives most of.
 *
 * Both octets are two digits by construction, so anything above 99 is not a team
 * address: that is what keeps FMS's own 10.0.100.5 from reading as team 100.
 * (Team 100 is 10.1.0.x, so the guard costs nothing.) The most-seen team wins,
 * which shrugs off a stray address left over from another network earlier in the
 * session.
 */
const TEAM_ADDRESS = /\b10\.(\d{1,3})\.(\d{1,3})\.\d{1,3}\b/g;

export function teamFromDsEvents(texts: string[]): number | null {
	const seen = new Map<number, number>();
	for (const text of texts) {
		for (const match of text.matchAll(TEAM_ADDRESS)) {
			const high = Number(match[1]);
			const low = Number(match[2]);
			if (high > 99 || low > 99) continue;
			const team = high * 100 + low;
			if (team <= 0) continue;
			seen.set(team, (seen.get(team) ?? 0) + 1);
		}
	}

	let best: number | null = null;
	let bestCount = 0;
	for (const [team, count] of seen) {
		if (count > bestCount) {
			best = team;
			bestCount = count;
		}
	}
	return best;
}

export function matchInfoFromDsEvents(entries: DsEventsEntry[]): DsEventsMatchInfo {
	const info: DsEventsMatchInfo = { fmsAttached: false };
	for (const entry of entries) {
		if (!info.fmsAttached && FMS_ANY.test(entry.text)) info.fmsAttached = true;
		const connected = FMS_CONNECTED.exec(entry.text);
		if (connected && info.matchNumber === undefined) {
			const type = connected[1];
			info.matchType = (type[0].toUpperCase() + type.slice(1).toLowerCase()) as DsEventsMatchInfo["matchType"];
			const number = Number(connected[2]);
			if (Number.isInteger(number) && number > 0) info.matchNumber = number;
		}
		const named = FMS_EVENT_NAME.exec(entry.text);
		if (named && !info.eventName) {
			const name = named[1].trim();
			if (name) info.eventName = name;
		}
	}
	return info;
}
