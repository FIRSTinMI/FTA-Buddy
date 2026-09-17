import { compressSync, decompressSync } from "fflate";
import type { FMSLogFrame } from "../../shared/types";

/**
 * How a station log is stored: gzipped JSON, base64 in a bytea column.
 *
 * This lives on its own rather than in `log-analysis.ts` because that module
 * imports the server's own entry point for its in-memory event map, so anything
 * that only needs to read a stored log would drag the whole server in with it.
 */

export function compressStationLog(log: FMSLogFrame[]): string {
	const buf = new TextEncoder().encode(JSON.stringify(log));
	// mem trades memory for speed, 0 to 12, default 4.
	return Buffer.from(compressSync(buf, { level: 6, mem: 6 })).toString("base64");
}

export function decompressStationLog(compressed: string): FMSLogFrame[] {
	const buf = Uint8Array.from(Buffer.from(compressed, "base64"));
	return JSON.parse(new TextDecoder().decode(decompressSync(buf))) as FMSLogFrame[];
}
