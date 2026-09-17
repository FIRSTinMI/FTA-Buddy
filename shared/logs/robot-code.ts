/**
 * What we can learn from a zip of a team's robot project without running
 * anything: which team it belongs to, what it is written in, and which files are
 * worth showing a CSA or handing to the assistant.
 *
 * Operates on an already-extracted listing so it stays dependency-free and can
 * run on either side of the wire.
 */

export interface CodeFile {
	/** Path inside the zip, with the wrapper directory already stripped. */
	path: string;
	size: number;
	/** Present for text files small enough to keep. */
	text?: string;
}

export type CodeLanguage = "java" | "cpp" | "python" | "labview" | "kotlin" | "unknown";

export interface RobotCodeInfo {
	teamNumber: number | null;
	/** Where the team number came from, for the "how do we know" line in the UI. */
	teamNumberFrom: string | null;
	language: CodeLanguage;
	/** WPILib project version out of `.wpilib/wpilib_preferences.json`. */
	projectYear: string | null;
	/** Vendor dependency names from `vendordeps/*.json`, e.g. `Phoenix6`, `REVLib`. */
	vendorDeps: string[];
	/** Files a reader should start from, in the order to read them. */
	keyFiles: string[];
	fileCount: number;
}

/** Extensions we treat as readable source. Binaries and build output are skipped. */
const SOURCE_EXTENSIONS = [
	".java",
	".kt",
	".cpp",
	".cc",
	".c",
	".h",
	".hpp",
	".inc",
	".py",
	".json",
	".gradle",
	".properties",
	".toml",
	".md",
	".txt",
	".xml",
	".yml",
	".yaml",
	".ini",
	".cfg",
	".vi",
];

/** Paths that are build output, dependencies or editor state, never the team's code. */
const IGNORED_PATH_PARTS = [
	"/build/",
	"/.git/",
	"/.gradle/",
	"/node_modules/",
	"/__pycache__/",
	"/.venv/",
	"/venv/",
	"/.idea/",
	"/bin/",
	"/obj/",
	"/.settings/",
];

export function isIgnoredCodePath(path: string): boolean {
	const p = `/${path.replace(/\\/g, "/")}`;
	if (IGNORED_PATH_PARTS.some((part) => p.includes(part))) return true;
	if (/(^|\/)\._/.test(p) || p.includes("/__MACOSX/")) return true;
	return false;
}

export function isSourceFile(path: string): boolean {
	const lower = path.toLowerCase();
	return SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Teams zip either the project folder or its contents. When every entry sits
 * under one directory, that directory is the wrapper and is stripped so paths
 * read the same either way.
 */
export function stripCommonPrefix(paths: string[]): string {
	const dirs = paths.map((p) => p.replace(/\\/g, "/")).filter((p) => !p.startsWith("__MACOSX/"));
	if (dirs.length === 0) return "";
	const first = dirs[0].split("/")[0];
	if (!first) return "";
	return dirs.every((p) => p.startsWith(`${first}/`)) ? `${first}/` : "";
}

function detectLanguage(paths: string[]): CodeLanguage {
	const has = (re: RegExp) => paths.some((p) => re.test(p));
	if (has(/\.java$/i)) return "java";
	if (has(/\.kt$/i)) return "kotlin";
	if (has(/\.(cpp|cc|hpp)$/i)) return "cpp";
	if (has(/robot\.py$/i) || has(/\.py$/i)) return "python";
	if (has(/\.vi$/i) || has(/\.lvproj$/i)) return "labview";
	return "unknown";
}

/** The files a reader should open first, in reading order. */
function pickKeyFiles(paths: string[]): string[] {
	const patterns: RegExp[] = [
		/(^|\/)Robot\.(java|kt|cpp|py)$/i,
		/(^|\/)RobotContainer\.(java|kt|cpp)$/i,
		/(^|\/)Constants\.(java|kt|h|hpp|py)$/i,
		/(^|\/)Main\.(java|kt|cpp)$/i,
		/(^|\/)build\.gradle$/i,
		/(^|\/)pyproject\.toml$/i,
		/(^|\/)wpilib_preferences\.json$/i,
		/\/subsystems\/[^/]+\.(java|kt|cpp|py)$/i,
		/\/commands\/[^/]+\.(java|kt|cpp|py)$/i,
	];
	const out: string[] = [];
	for (const pattern of patterns) {
		for (const path of paths) {
			if (pattern.test(path) && !out.includes(path)) out.push(path);
		}
	}
	return out.slice(0, 40);
}

function teamFromPreferences(text: string): number | null {
	try {
		const parsed: unknown = JSON.parse(text);
		if (parsed && typeof parsed === "object") {
			const value = (parsed as Record<string, unknown>).teamNumber;
			if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
			if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
		}
	} catch {
		// Not valid JSON; fall through and let another source answer.
	}
	return null;
}

/** `team = 1234` inside a `frc { }` or `deploy { }` block, for hand-edited builds. */
function teamFromBuildGradle(text: string): number | null {
	const m = /\bteam\s*=\s*(\d{1,5})\b/.exec(text);
	if (!m) return null;
	const value = Number(m[1]);
	return value > 0 ? value : null;
}

function vendorDepName(path: string, text: string | undefined): string | null {
	if (!/vendordeps\/[^/]+\.json$/i.test(path)) return null;
	if (text) {
		try {
			const parsed: unknown = JSON.parse(text);
			const name = (parsed as Record<string, unknown> | null)?.name;
			if (typeof name === "string" && name.trim()) return name.trim();
		} catch {
			// Fall back to the file name.
		}
	}
	return path.replace(/^.*\//, "").replace(/\.json$/i, "");
}

/**
 * Read a project's identity out of its files. The team number is taken from
 * `.wpilib/wpilib_preferences.json` first: that is the file the deploy tool
 * itself reads, so it is the one that was actually used to push code to the
 * robot. A hand-written `team =` in `build.gradle` is the fallback.
 */
export function readRobotCode(files: CodeFile[]): RobotCodeInfo {
	const paths = files.map((f) => f.path);
	let teamNumber: number | null = null;
	let teamNumberFrom: string | null = null;
	let projectYear: string | null = null;
	const vendorDeps: string[] = [];

	for (const file of files) {
		if (/(^|\/)\.wpilib\/wpilib_preferences\.json$/i.test(file.path) && file.text) {
			const team = teamFromPreferences(file.text);
			if (team !== null) {
				teamNumber = team;
				teamNumberFrom = file.path;
			}
			try {
				const parsed = JSON.parse(file.text) as Record<string, unknown>;
				const year = parsed.projectYear;
				if (typeof year === "string") projectYear = year;
				else if (typeof year === "number") projectYear = String(year);
			} catch {
				// Preferences file is not valid JSON; the team number lookup above already handled it.
			}
		}
		const vendor = vendorDepName(file.path, file.text);
		if (vendor && !vendorDeps.includes(vendor)) vendorDeps.push(vendor);
	}

	if (teamNumber === null) {
		for (const file of files) {
			if (/(^|\/)build\.gradle$/i.test(file.path) && file.text) {
				const team = teamFromBuildGradle(file.text);
				if (team !== null) {
					teamNumber = team;
					teamNumberFrom = file.path;
					break;
				}
			}
		}
	}

	return {
		teamNumber,
		teamNumberFrom,
		language: detectLanguage(paths),
		projectYear,
		vendorDeps: vendorDeps.sort(),
		keyFiles: pickKeyFiles(paths),
		fileCount: files.length,
	};
}

/**
 * Team number out of a SystemCore support bundle. The bundle records the team
 * the device is set to, which is the device's own opinion rather than a guess.
 */
export function teamFromSupportBundle(files: CodeFile[]): { team: number; from: string } | null {
	for (const file of files) {
		if (!file.text) continue;
		if (/(^|\/)(sys|config)\/.*\.json$/i.test(file.path) || /manifest\.json$/i.test(file.path)) {
			try {
				const parsed = JSON.parse(file.text) as Record<string, unknown>;
				for (const key of ["teamNumber", "team_number", "team"]) {
					const value = parsed[key];
					const team =
						typeof value === "number"
							? value
							: typeof value === "string" && /^\d+$/.test(value)
								? Number(value)
								: null;
					if (team !== null && team > 0) return { team, from: file.path };
				}
			} catch {
				// Not JSON we understand; keep looking.
			}
		}
		// mrccomm logs the team on every boot: "Team changed to 1234".
		const m = /Team changed to (\d{1,5})\b/.exec(file.text);
		if (m && Number(m[1]) > 0) return { team: Number(m[1]), from: file.path };
	}
	return null;
}
