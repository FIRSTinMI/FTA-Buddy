// Helpers shared by the Sphinx / Read the Docs sites (WPILib, CTRE).

import { inflateSync } from "node:zlib";
import { politeFetch } from "./fetch";

/** Document paths (relative to base) from a Sphinx objects.inv inventory. Bounded and cheap: one request. */
export async function sphinxDocs(base: string): Promise<string[]> {
	const r = await politeFetch(base + "objects.inv", { binary: true });
	if (r.status !== 200) throw new Error(`${base}objects.inv -> ${r.status}`);
	const bytes = Buffer.from(r.body, "base64");
	let nl = 0;
	let i = 0;
	for (; i < bytes.length && nl < 4; i++) if (bytes[i] === 10) nl++;
	const text = inflateSync(bytes.subarray(i)).toString("utf8");
	const docs = new Set<string>();
	for (const line of text.split("\n")) {
		const m = line.match(/^(\S+)\s+(\S+)\s+(-?\d+)\s+(\S+)\s+(.*)$/);
		if (m && m[2] === "std:doc") docs.add(m[4]);
	}
	return [...docs];
}

/** "Last updated on Mar 15, 2026" from the RTD theme footer, or null. */
export function sphinxLastUpdated(html: string): Date | null {
	const m = html.match(/Last updated on ([A-Z][a-z]{2,8} \d{1,2}, \d{4})/);
	if (!m) return null;
	const d = new Date(m[1]);
	return Number.isNaN(d.getTime()) ? null : d;
}

export function inScope(path: string, scope: string[]): boolean {
	return scope.some((prefix) => (prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix));
}
