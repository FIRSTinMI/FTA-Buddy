import { unzipSync } from "fflate";
import { isIgnoredCodePath, isSourceFile } from "../../../shared/logs/robot-code";

/**
 * Opening a zip a stranger uploaded.
 *
 * Every limit here exists because the file arrives from a team's laptop over an
 * endpoint with no login. A zip bomb, a 40,000 file `build/` directory and a
 * `../../etc/passwd` entry all have to come back as "we read what we could"
 * rather than as an outage.
 */

/** Entries we will look at at all. A real robot project is a few hundred files. */
const MAX_ENTRIES = 6000;
/** Largest single entry we will decompress and keep. */
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;
/** Total decompressed bytes across the whole archive. */
const MAX_TOTAL_BYTES = 96 * 1024 * 1024;
/** Text we keep as readable text rather than only as bytes. */
export const MAX_TEXT_BYTES = 512 * 1024;

export interface ZipEntry {
	/** Path with the wrapper directory still on it, cleaned of `\` and `./`. */
	path: string;
	data: Uint8Array;
}

export interface ZipReadResult {
	entries: ZipEntry[];
	/** Names present in the archive, including ones we chose not to extract. */
	allPaths: string[];
	/** Entries skipped, with why, so the UI can say so instead of silently losing files. */
	skipped: { path: string; why: string }[];
	truncated: boolean;
}

/** `..` segments, absolute paths and Windows drive letters never get extracted. */
function isUnsafePath(path: string): boolean {
	const p = path.replace(/\\/g, "/");
	if (p.startsWith("/") || /^[a-zA-Z]:/.test(p)) return true;
	return p.split("/").some((segment) => segment === "..");
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Read a zip's entries. `keepPredicate` decides which entries are worth
 * decompressing: robot code wants source files only, a support bundle wants
 * everything textual. Directory entries are dropped.
 */
export function readZip(data: Uint8Array, keep: (path: string, originalSize: number) => boolean): ZipReadResult {
	const allPaths: string[] = [];
	const skipped: { path: string; why: string }[] = [];
	let entryCount = 0;
	let totalBytes = 0;
	let truncated = false;

	let files: Record<string, Uint8Array>;
	try {
		files = unzipSync(data, {
			filter: (file) => {
				const path = normalizePath(file.name);
				entryCount++;
				if (entryCount > MAX_ENTRIES) {
					truncated = true;
					return false;
				}
				allPaths.push(path);
				if (path.endsWith("/")) return false;
				if (isUnsafePath(path)) {
					skipped.push({ path, why: "unsafe path" });
					return false;
				}
				if (file.originalSize !== undefined && file.originalSize > MAX_ENTRY_BYTES) {
					skipped.push({ path, why: "file too large to open" });
					return false;
				}
				if (totalBytes + (file.originalSize ?? 0) > MAX_TOTAL_BYTES) {
					truncated = true;
					return false;
				}
				if (!keep(path, file.originalSize ?? 0)) return false;
				totalBytes += file.originalSize ?? 0;
				return true;
			},
		});
	} catch (err) {
		// A corrupt or unsupported archive. The zip itself is still stored, so a
		// CSA can download it; we just cannot list what is inside.
		return {
			entries: [],
			allPaths,
			skipped: [{ path: "", why: err instanceof Error ? err.message : "could not be opened" }],
			truncated,
		};
	}

	const entries: ZipEntry[] = Object.entries(files).map(([path, bytes]) => ({
		path: normalizePath(path),
		data: bytes,
	}));
	return { entries, allPaths, skipped, truncated };
}

/** Robot code: source files only, and never build output or dependencies. */
export function keepCodeEntry(path: string): boolean {
	if (isIgnoredCodePath(path)) return false;
	return isSourceFile(path);
}

/**
 * Support bundle: keep the whole thing. It is a device dump of logs and JSON
 * that is the entire point of the upload, and the bundles run a few hundred KB.
 */
export function keepBundleEntry(path: string, originalSize: number): boolean {
	if (originalSize > MAX_ENTRY_BYTES) return false;
	return !/(^|\/)__MACOSX\//.test(path);
}

const decoder = new TextDecoder("utf-8", { fatal: false });

/** Decode an entry as text when it plausibly is text, otherwise null. */
export function entryText(data: Uint8Array): string | null {
	if (data.length === 0) return "";
	if (data.length > MAX_TEXT_BYTES) return null;
	const sample = data.subarray(0, Math.min(data.length, 4096));
	for (const byte of sample) if (byte === 0) return null;
	return decoder.decode(data);
}
