/**
 * What kind of file a team just handed us.
 *
 * Extensions are a hint, not the answer: teams rename files, browsers mangle
 * them, and a `.zip` could be a robot project or a SystemCore support bundle.
 * So the extension picks the candidate and the bytes confirm it.
 */

import { looksLikeTelemetryCsv } from "./csv-telemetry";
import { isDsLog } from "./dslog";
import { isWpilog } from "./wpilog";

export type UploadKind =
	/** WPILib data log from the robot. */
	| "wpilog"
	/** Driver Station telemetry, 20 Hz. */
	| "dslog"
	/** Driver Station message log. */
	| "dsevents"
	/** SystemCore support bundle, `.zip` or `.llsupport`. */
	| "support-bundle"
	/** CTRE Phoenix 6 signal log. Closed format; converted by CTRE's owlet. */
	| "hoot"
	/** Timestamped CSV, e.g. a REV Hardware Client telemetry export. */
	| "csv"
	/** Zip of a robot project. */
	| "code-zip"
	/** A zip we could not place. Still stored, still readable. */
	| "zip"
	/** Plain text: console output, a pasted error, `driverstation.log`. */
	| "text"
	| "other";

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export function isZip(data: Uint8Array): boolean {
	return data.length >= 4 && ZIP_MAGIC.every((b, i) => data[i] === b);
}

/** Bytes that mean this is not text we should try to show. */
function looksBinary(data: Uint8Array): boolean {
	const n = Math.min(data.length, 8000);
	let suspicious = 0;
	for (let i = 0; i < n; i++) {
		const byte = data[i];
		if (byte === 0) return true;
		if (byte < 9 || (byte > 13 && byte < 32)) suspicious++;
	}
	return suspicious > n * 0.05;
}

/**
 * Classify one file. `zipEntryPaths` is only needed to tell a support bundle
 * from a robot project; pass it when the zip has already been opened.
 */
export function detectKind(fileName: string, data: Uint8Array, zipEntryPaths?: string[]): UploadKind {
	const name = fileName.replace(/^.*[/\\]/, "").toLowerCase();

	if (isWpilog(data)) return "wpilog";

	// A Hoot log states its own tag, and teams rename these constantly.
	if (
		name.endsWith(".hoot") ||
		(data.length >= 4 && new TextDecoder("utf-8", { fatal: false }).decode(data.subarray(0, 4)) === "HOOT")
	) {
		return "hoot";
	}

	// The two DS formats share a header, so the extension is what separates them.
	if (isDsLog(data)) {
		if (name.endsWith(".dsevents")) return "dsevents";
		if (name.endsWith(".dslog")) return "dslog";
	}

	if (isZip(data) || name.endsWith(".llsupport")) {
		if (name.endsWith(".llsupport")) return "support-bundle";
		if (zipEntryPaths) return classifyZip(zipEntryPaths);
		return "zip";
	}

	if (name.endsWith(".wpilog")) return "wpilog";
	if (name.endsWith(".dslog")) return "dslog";
	if (name.endsWith(".dsevents")) return "dsevents";

	if (!looksBinary(data)) {
		const text = new TextDecoder("utf-8", { fatal: false }).decode(data.subarray(0, 8000));
		if (looksLikeTelemetryCsv(text)) return "csv";
		return "text";
	}
	return "other";
}

/** A zip's own contents say what it is. */
export function classifyZip(paths: string[]): UploadKind {
	const lower = paths.map((p) => p.replace(/\\/g, "/").toLowerCase());
	const any = (re: RegExp) => lower.some((p) => re.test(p));

	// A support bundle is a device dump: a manifest plus system and log trees.
	const bundleMarkers = [/(^|\/)manifest\.json$/, /(^|\/)sys\//, /(^|\/)logs\/boot-\d/, /(^|\/)vision\/agg\//];
	if (bundleMarkers.filter((re) => any(re)).length >= 2) return "support-bundle";

	// A robot project has the files the deploy tool needs.
	if (any(/(^|\/)\.wpilib\/wpilib_preferences\.json$/)) return "code-zip";
	if (any(/(^|\/)build\.gradle$/) && any(/(^|\/)src\//)) return "code-zip";
	if (any(/(^|\/)robot\.py$/)) return "code-zip";
	if (any(/(^|\/)[^/]+\.lvproj$/)) return "code-zip";

	return "zip";
}

/** Human label for the UI and for prompts. */
export const KIND_LABELS: Record<UploadKind, string> = {
	wpilog: "Data log",
	dslog: "Driver Station log",
	dsevents: "Driver Station events",
	"support-bundle": "SystemCore support bundle",
	hoot: "CTRE signal log",
	csv: "Telemetry CSV",
	"code-zip": "Robot code",
	zip: "Zip",
	text: "Text log",
	other: "File",
};

/** Kinds the portal and the app accept. Anything else is refused at the door. */
export const ACCEPTED_EXTENSIONS = [
	".wpilog",
	".dslog",
	".dsevents",
	".log",
	".txt",
	".zip",
	".llsupport",
	".json",
	".hoot",
	".csv",
];

export function hasAcceptedExtension(fileName: string): boolean {
	const lower = fileName.toLowerCase();
	return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
