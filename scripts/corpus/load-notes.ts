// docs/troubleshooting/notes/*.md -> source "note". The folder is the source of truth:
// every run replaces the whole "note" source so a deleted file disappears from search.
//
// File format:
//   ---
//   title: Short problem statement
//   url: https://optional/reference       (optional)
//   date: 2026-03-14                       (optional, defaults to file mtime)
//   ---
//   Plain markdown body, 2 to 8 sentences. No team numbers, event names or people.

import "dotenv/config";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { connect } from "../../src/db/db";
import type { TroubleshootChunkInsert } from "../../src/db/schema";
import { deleteChunksBySource, upsertChunks } from "../../src/util/troubleshoot/chunks";

export const NOTES_DIR = join(__dirname, "..", "..", "docs", "troubleshooting", "notes");

interface Frontmatter {
	title?: string;
	url?: string;
	date?: string;
}

function parseNote(raw: string): { meta: Frontmatter; body: string } {
	const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!m) return { meta: {}, body: raw.trim() };
	const meta: Frontmatter = {};
	for (const line of m[1].split(/\r?\n/)) {
		const kv = line.match(/^([A-Za-z_]+)\s*:\s*(.*)$/);
		if (!kv) continue;
		const value = kv[2].trim().replace(/^["']|["']$/g, "");
		if (kv[1] === "title" || kv[1] === "url" || kv[1] === "date") meta[kv[1]] = value;
	}
	return { meta, body: m[2].trim() };
}

export function loadNotes(dir = NOTES_DIR): TroubleshootChunkInsert[] {
	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".md") && !f.startsWith("_") && f.toLowerCase() !== "readme.md")
		.sort();
	const out: TroubleshootChunkInsert[] = [];
	for (const f of files) {
		const path = join(dir, f);
		const { meta, body } = parseNote(readFileSync(path, "utf8"));
		if (!body) {
			console.warn(`[notes] ${f} has no body, skipped`);
			continue;
		}
		const slug = basename(f, ".md");
		const title = meta.title ?? body.split(/\r?\n/)[0].replace(/^#+\s*/, "");
		const date = meta.date ? new Date(meta.date) : statSync(path).mtime;
		out.push({
			source: "note",
			source_key: `note:${slug}`,
			url: meta.url ?? null,
			title,
			heading: null,
			body,
			source_date: Number.isNaN(date.getTime()) ? null : date,
		});
	}
	return out;
}

async function main() {
	const notes = loadNotes();
	await connect();
	await deleteChunksBySource("note");
	const written = await upsertChunks(notes);
	console.log(`[notes] ${written} notes loaded from ${NOTES_DIR}`);
	process.exit(0);
}

if (require.main === module) main().catch((e) => {
	console.error("[notes] failed:", e);
	process.exit(1);
});
