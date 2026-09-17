import { spawn } from "child_process";
import { createHash } from "crypto";
import { existsSync } from "fs";
import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Decoding CTRE Hoot logs.
 *
 * Phoenix 6 signal logging writes `.hoot` files, and the format is closed: there
 * is no spec to implement. CTRE ships a converter called `owlet` that turns a
 * Hoot log into a WPILib data log, which is the format we already read, so the
 * whole of this file is about getting hold of the right `owlet` and running it.
 *
 * How the version is chosen, which is the part that is easy to get wrong: a Hoot
 * file declares a "compliancy" number in byte 70, and only an `owlet` built for
 * that compliancy can open it. CTRE publishes an index of every build with its
 * compliancy and a sha1, so the right one is downloaded on demand and cached.
 *
 * `owlet` is CTRE's binary, not ours, and it is covered by their licence:
 * https://raw.githubusercontent.com/CrossTheRoadElec/Phoenix-Releases/refs/heads/master/CTRE_LICENSE.txt
 * Set `HOOT_DECODE_ENABLED=false` to switch this off and keep storing `.hoot`
 * files without converting them.
 *
 * The mechanism here follows AdvantageScope's `owletDownload` and
 * `owletInterface` (BSD, Littleton Robotics), which is where the byte offset and
 * the index layout come from.
 *
 * One deployment note: owlet 1.0.1.1 needs glibc 2.34 and GLIBCXX 3.4.30. The
 * production container (`oven/bun:1`, Debian trixie) has them; an older host
 * running the server directly does not, and there the conversion fails with a
 * linker error that is reported as-is rather than swallowed.
 */

const INDEX_URL = "https://redist.ctr-electronics.com/index.json";
const CTRE_LICENSE_URL =
	"https://raw.githubusercontent.com/CrossTheRoadElec/Phoenix-Releases/refs/heads/master/CTRE_LICENSE.txt";

/** Oldest Hoot a released owlet can open. Phoenix 2024 and later. */
const MIN_COMPLIANCY = 6;

/** Where cached owlet binaries live. Outside the repo, like every other runtime file. */
function owletDir(): string {
	return process.env.OWLET_DIR ?? "/var/lib/ftabuddy/owlet";
}

export function hootDecodeEnabled(): boolean {
	return process.env.HOOT_DECODE_ENABLED !== "false";
}

export class HootError extends Error {}

/**
 * Is this a Hoot log?
 *
 * There is no magic tag, which a real file makes plain: it opens with the CAN
 * bus name in a 64 byte NUL-padded field, then the Phoenix version as text,
 * then the compliancy byte. A real one starts `Drivetrain\0\0...25.3.0\0\r`.
 * So the extension is the primary signal and this shape is the confirmation.
 */
export function isHoot(data: Uint8Array, fileName: string): boolean {
	if (fileName.toLowerCase().endsWith(".hoot")) return true;
	if (data.length < 72) return false;
	const decoder = new TextDecoder("utf-8", { fatal: false });
	const name = decoder.decode(data.subarray(0, 64));
	// A printable name, then NUL padding to the end of the field.
	if (!/^[\x20-\x7e]{1,63}\x00+$/.test(name)) return false;
	// Then a version like "25.3.0", NUL padded to byte 70.
	return /^\d+\.\d+\.\d+\x00*$/.test(decoder.decode(data.subarray(64, 70)));
}

/** The CAN bus the log came from, out of that 64 byte name field. */
export function hootBusName(data: Uint8Array): string | null {
	if (data.length < 64) return null;
	const name = new TextDecoder("utf-8", { fatal: false }).decode(data.subarray(0, 64)).replace(/\0+$/, "");
	return /^[\x20-\x7e]+$/.test(name) ? name : null;
}

/** The Phoenix version that wrote it, as text, from bytes 64 to 69. */
export function hootPhoenixVersion(data: Uint8Array): string | null {
	if (data.length < 70) return null;
	const version = new TextDecoder("utf-8", { fatal: false }).decode(data.subarray(64, 70)).replace(/\0+$/, "");
	return /^\d+\.\d+\.\d+$/.test(version) ? version : null;
}

/** The compliancy a Hoot file needs, read from byte 70. */
export function hootCompliancy(data: Uint8Array): number | null {
	if (data.length < 71) return null;
	return data[70];
}

interface CtreIndex {
	Tools?: { Name: string; Items: { Version: string; Compliancy: number; Urls: Record<string, string> }[] }[];
}

/** Which key in the index's `Urls` map this machine needs. */
function owletPlatform(): string {
	if (process.platform === "win32") return "windowsx86-64";
	if (process.platform === "darwin") return "macosuniversal";
	if (process.arch === "arm64") return "linuxarm64";
	if (process.arch === "arm") return "linuxarm32";
	return "linuxx86-64";
}

function cachedName(version: string, compliancy: number): string {
	return `owlet-${version}-C${compliancy}${process.platform === "win32" ? ".exe" : ""}`;
}

/**
 * Get an owlet that can open this compliancy, downloading it if we do not have
 * one. Verified against the index's sha1 before it is ever executed.
 */
async function ensureOwlet(compliancy: number): Promise<string> {
	const dir = owletDir();
	await mkdir(dir, { recursive: true });

	// The compliancy suffix has to match whole: a search for "-C1" would
	// otherwise accept the -C13 build, which cannot open a compliancy 1 log.
	const suffix = new RegExp(`-C${compliancy}(\\.exe)?$`);
	const existing = (await readdir(dir).catch(() => [] as string[])).filter(
		(name) => name.startsWith("owlet-") && suffix.test(name),
	);
	if (existing.length > 0) return join(dir, existing.sort().reverse()[0]);

	const response = await fetch(INDEX_URL, { signal: AbortSignal.timeout(20_000) });
	if (!response.ok)
		throw new HootError(`CTRE's tool index answered ${response.status}, so owlet could not be fetched.`);
	const index = (await response.json()) as CtreIndex;
	const owlet = index.Tools?.find((tool) => tool.Name === "owlet");
	if (!owlet) throw new HootError("CTRE's tool index does not list owlet.");

	const platform = owletPlatform();
	// Newest build for this compliancy that has a binary for us.
	const candidates = owlet.Items.filter(
		(item) => item.Compliancy === compliancy && item.Urls[platform] && item.Urls[`${platform}-sha1`],
	);
	if (candidates.length === 0) {
		throw new HootError(
			`CTRE has no owlet build for compliancy ${compliancy} on this platform, so this Hoot log cannot be decoded.`,
		);
	}
	const chosen = candidates.sort((a, b) => b.Version.localeCompare(a.Version, undefined, { numeric: true }))[0];

	const binary = await fetch(chosen.Urls[platform], { signal: AbortSignal.timeout(120_000) });
	if (!binary.ok) throw new HootError(`Downloading owlet answered ${binary.status}.`);
	const bytes = Buffer.from(await binary.arrayBuffer());
	const sha1 = createHash("sha1").update(bytes).digest("hex");
	if (sha1 !== chosen.Urls[`${platform}-sha1`]) {
		throw new HootError("The owlet download did not match CTRE's published checksum, so it was not run.");
	}

	const path = join(dir, cachedName(chosen.Version, chosen.Compliancy));
	await writeFile(path, bytes);
	await chmod(path, 0o755);
	console.log(
		`[hoot] cached owlet ${chosen.Version} (compliancy ${chosen.Compliancy}) from CTRE. Licence: ${CTRE_LICENSE_URL}`,
	);
	return path;
}

function run(
	command: string,
	args: string[],
	timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new HootError("owlet took too long and was stopped."));
		}, timeoutMs);
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.once("error", (err) => {
			clearTimeout(timer);
			reject(new HootError(`owlet could not be run: ${err.message}`));
		});
		child.once("exit", (code) => {
			clearTimeout(timer);
			resolve({ code: code ?? -1, stdout, stderr });
		});
	});
}

export interface HootConversion {
	/** The converted data log, ready for the WPILOG reader. */
	wpilog: Uint8Array;
	owletVersion: string;
	compliancy: number;
	/** The CAN bus this log was taken from, e.g. `Drivetrain` or `rio`. */
	busName: string | null;
	phoenixVersion: string | null;
	/** False when the log holds non-Pro devices, which limits what was recorded. */
	pro: boolean | null;
}

/**
 * Convert a Hoot log to a WPILib data log. Throws `HootError` with a message
 * worth showing a CSA: "too old to decode" and "owlet is not available" are
 * different problems and they should read differently.
 */
export async function convertHoot(data: Uint8Array, fileName: string): Promise<HootConversion> {
	if (!hootDecodeEnabled()) throw new HootError("Decoding Hoot logs is switched off on this server.");
	const compliancy = hootCompliancy(data);
	if (compliancy === null) throw new HootError("That Hoot file is too short to read.");
	if (compliancy < MIN_COMPLIANCY) {
		throw new HootError(
			"That Hoot log was written by Phoenix 2023 or earlier, which no released owlet can decode.",
		);
	}

	const owlet = await ensureOwlet(compliancy);
	const work = join(tmpdir(), `hoot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
	await mkdir(work, { recursive: true });
	const input = join(work, "input.hoot");
	const output = join(work, "output.wpilog");
	try {
		await writeFile(input, data);

		// Pro state first: it changes what the log could contain, and it is cheap.
		let pro: boolean | null = null;
		try {
			const check = await run(owlet, [input, "--check-pro"], 30_000);
			if (check.code === 0) pro = !check.stdout.includes("NOT");
		} catch {
			// Not worth failing the conversion over.
		}

		let result = await run(owlet, [input, output, "-f", "wpilog"], 180_000);
		if (!existsSync(output) && pro !== false) {
			// A log holding Phoenix Pro devices fails the licence check. Retrying
			// without it still gets the non-Pro signals out, which is better than
			// handing a CSA nothing.
			result = await run(owlet, [input, output, "-f", "wpilog", "--unlicensed"], 180_000);
		}
		if (!existsSync(output)) {
			const detail = (result.stderr || result.stdout).trim().slice(0, 300);
			throw new HootError(`owlet did not produce a data log${detail ? `: ${detail}` : "."}`);
		}
		const wpilog = new Uint8Array(await readFile(output));
		return {
			wpilog,
			owletVersion: owlet.replace(/^.*\//, ""),
			compliancy,
			busName: hootBusName(data),
			phoenixVersion: hootPhoenixVersion(data),
			pro,
		};
	} finally {
		await rm(work, { recursive: true, force: true }).catch(() => undefined);
	}
}

/**
 * A Hoot log converted once and kept on disk for a while.
 *
 * A 13.7 MB Hoot expands to about 250 MB of data log, so the conversion is not
 * stored with the upload: it is read for its summary at ingest and thrown away.
 * When somebody then asks for a signal, this converts again, which takes about
 * five seconds, and keeps the result in the temp directory so the next question
 * about the same log is instant.
 */
const CACHE_TTL_MS = 30 * 60 * 1000;

function cachePath(fileId: string): string {
	return join(tmpdir(), `ftabuddy-hoot-${fileId.replace(/[^a-zA-Z0-9-]/g, "")}.wpilog`);
}

export async function convertHootCached(fileId: string, data: Uint8Array): Promise<Uint8Array> {
	const path = cachePath(fileId);
	try {
		const { mtimeMs } = await stat(path);
		if (Date.now() - mtimeMs < CACHE_TTL_MS) return new Uint8Array(await readFile(path));
	} catch {
		// Not cached yet, or the temp directory was cleared.
	}
	const converted = await convertHoot(data, fileId);
	await writeFile(path, converted.wpilog);
	return converted.wpilog;
}
