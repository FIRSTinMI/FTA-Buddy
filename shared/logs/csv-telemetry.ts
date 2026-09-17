/**
 * Timestamped CSV, which is how everything that is not WPILib gets its numbers
 * out.
 *
 * REV's ION devices (SPARK MAX, SPARK Flex, the PDH) write no log file of their
 * own. What REV gives you is the Hardware Client's Telemetry tab, which exports
 * a CSV of Unix timestamps, signal names and device names. So supporting REV
 * telemetry means supporting timestamped CSV, and that also picks up whatever a
 * team exported from their dashboard, a scope, or a spreadsheet.
 *
 * Two shapes are read, because both are common:
 *
 * - WIDE: one row per instant, one column per signal.
 *     timestamp,Motor1 Velocity,Motor1 Current
 *     1741712345.2,1200,14.5
 * - LONG: one row per sample, with the signal named in a column.
 *     timestamp,device,signal,value
 *     1741712345.2,SPARK MAX 3,Applied Output,0.42
 *
 * Nothing is guessed about units. A column is a series if its values parse as
 * numbers, and the header is its label as written.
 */

export interface CsvSeries {
	/** Header text as the exporting tool wrote it. */
	label: string;
	/** Samples, in file order. */
	points: { t: number; v: number }[];
}

export interface CsvTelemetry {
	parsed: boolean;
	shape: "wide" | "long" | null;
	/** Which column the time came from. */
	timeColumn: string | null;
	/**
	 * True when the timestamps looked like absolute Unix time rather than seconds
	 * from the start of the recording, which is what decides whether this can be
	 * put on a match clock at all.
	 */
	absoluteTime: boolean;
	series: CsvSeries[];
	rowCount: number;
	/** Why it could not be read, for the CSA rather than the log. */
	problem?: string;
}

/** Rows we will read. A telemetry export at 50 Hz for a match is about 7,500. */
const MAX_ROWS = 400_000;
const MAX_SERIES = 200;

/** Header names that mean "this is the time column", in the order we prefer them. */
const TIME_HEADERS = [
	"timestamp",
	"time",
	"time (s)",
	"timestamp (s)",
	"unix time",
	"unix timestamp",
	"t",
	"time_s",
	"epoch",
];
const SIGNAL_HEADERS = ["signal", "name", "key", "topic", "label"];
const VALUE_HEADERS = ["value", "val", "data"];
const DEVICE_HEADERS = ["device", "device name", "deviceid", "device id", "source"];

/** Anything after 2010 in seconds, or in milliseconds, is a wall clock. */
const ABSOLUTE_SECS_FROM = 1_262_304_000;

/**
 * Split one CSV line properly: quoted fields may hold commas, and a signal name
 * like `Motor 1, Applied Output` is exactly the kind of header that appears.
 */
export function splitCsvLine(line: string): string[] {
	const out: string[] = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (quoted) {
			if (ch === '"') {
				if (line[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					quoted = false;
				}
			} else {
				field += ch;
			}
		} else if (ch === '"') {
			quoted = true;
		} else if (ch === ",") {
			out.push(field);
			field = "";
		} else {
			field += ch;
		}
	}
	out.push(field);
	return out.map((f) => f.trim());
}

function headerIndex(headers: string[], names: string[]): number {
	const lower = headers.map((h) => h.trim().toLowerCase());
	for (const name of names) {
		const at = lower.indexOf(name);
		if (at >= 0) return at;
	}
	// Fall back to a header that merely contains the word, e.g. "Timestamp (Unix)".
	for (const name of names) {
		const at = lower.findIndex((h) => h.includes(name));
		if (at >= 0) return at;
	}
	return -1;
}

function parseTime(raw: string): { t: number; absolute: boolean } | null {
	const value = Number(raw);
	if (Number.isFinite(value)) {
		// Milliseconds since the epoch is the other common export.
		if (value > ABSOLUTE_SECS_FROM * 1000) return { t: value / 1000, absolute: true };
		if (value > ABSOLUTE_SECS_FROM) return { t: value, absolute: true };
		return { t: value, absolute: false };
	}
	const parsed = Date.parse(raw);
	if (Number.isFinite(parsed)) return { t: parsed / 1000, absolute: true };
	return null;
}

/** Read a telemetry CSV. Never throws: an unreadable file comes back with `problem` set. */
export function readCsvTelemetry(text: string): CsvTelemetry {
	const empty: CsvTelemetry = {
		parsed: false,
		shape: null,
		timeColumn: null,
		absoluteTime: false,
		series: [],
		rowCount: 0,
	};
	const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
	if (lines.length < 2) return { ...empty, problem: "The file has no rows." };

	const headers = splitCsvLine(lines[0]);
	const timeAt = headerIndex(headers, TIME_HEADERS);
	if (timeAt < 0) {
		return { ...empty, problem: "No time column: the first row needs a header like `timestamp` or `time`." };
	}

	const signalAt = headerIndex(headers, SIGNAL_HEADERS);
	const valueAt = headerIndex(headers, VALUE_HEADERS);
	const deviceAt = headerIndex(headers, DEVICE_HEADERS);
	const long = signalAt >= 0 && valueAt >= 0;

	const byLabel = new Map<string, CsvSeries>();
	let absolute = false;
	let rowCount = 0;

	for (let i = 1; i < lines.length && rowCount < MAX_ROWS; i++) {
		const cells = splitCsvLine(lines[i]);
		const time = parseTime(cells[timeAt] ?? "");
		if (!time) continue;
		if (time.absolute) absolute = true;
		rowCount++;

		if (long) {
			const value = Number(cells[valueAt]);
			if (!Number.isFinite(value)) continue;
			const device = deviceAt >= 0 ? cells[deviceAt] : "";
			const label = [device, cells[signalAt]].filter(Boolean).join(" / ") || cells[signalAt] || "value";
			const series = byLabel.get(label) ?? { label, points: [] };
			series.points.push({ t: time.t, v: value });
			if (!byLabel.has(label) && byLabel.size < MAX_SERIES) byLabel.set(label, series);
		} else {
			for (let column = 0; column < headers.length; column++) {
				if (column === timeAt) continue;
				const value = Number(cells[column]);
				if (!Number.isFinite(value)) continue;
				const label = headers[column] || `column ${column}`;
				const series = byLabel.get(label) ?? { label, points: [] };
				series.points.push({ t: time.t, v: value });
				if (!byLabel.has(label) && byLabel.size < MAX_SERIES) byLabel.set(label, series);
			}
		}
	}

	const series = [...byLabel.values()].filter((s) => s.points.length > 0);
	if (series.length === 0) {
		return { ...empty, rowCount, problem: "A time column was found but no numeric values alongside it." };
	}
	return {
		parsed: true,
		shape: long ? "long" : "wide",
		timeColumn: headers[timeAt],
		absoluteTime: absolute,
		series,
		rowCount,
	};
}

/** Does this text look like a CSV we could read? Cheap enough to run on every text upload. */
export function looksLikeTelemetryCsv(text: string): boolean {
	const firstLine = text.slice(0, 4000).split(/\r?\n/)[0] ?? "";
	if (!firstLine.includes(",")) return false;
	return headerIndex(splitCsvLine(firstLine), TIME_HEADERS) >= 0;
}

export function describeCsvTelemetry(csv: CsvTelemetry): string {
	if (!csv.parsed) return csv.problem ?? "Not a readable telemetry CSV.";
	const lines = [
		`Telemetry CSV, ${csv.shape} layout, ${csv.rowCount.toLocaleString()} rows, ${csv.series.length} signals.`,
		`Time column: ${csv.timeColumn}${csv.absoluteTime ? " (wall clock, so this can be lined up with a match)" : " (relative, so it cannot be placed on the match clock)"}`,
		"",
		"Signals:",
	];
	for (const series of csv.series.slice(0, 60)) {
		const values = series.points.map((p) => p.v);
		const min = Math.min(...values);
		const max = Math.max(...values);
		lines.push(`  ${series.label}  ${series.points.length} samples, ${min.toFixed(2)} to ${max.toFixed(2)}`);
	}
	if (csv.series.length > 60) lines.push(`  ... ${csv.series.length - 60} more`);
	return lines.join("\n");
}
