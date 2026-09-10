// HTML page -> plain-text chunks split on h1/h2/h3, sized ~300 to 600 words.
// A small tag tokenizer instead of a DOM: it tracks the open-element stack so
// nav, sidebars, footers and anything with a nav-ish class are dropped, list
// items land on their own lines and <pre> blocks survive verbatim.

import type { TroubleshootChunkInsert } from "../../../src/db/schema";

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const DROP_TAGS = new Set(["nav", "aside", "footer", "header", "button", "form", "input", "select", "textarea", "dialog", "label", "img", "video", "audio", "canvas", "map", "object"]);
const RAW_TAGS = ["script", "style", "svg", "noscript", "template", "iframe", "math"];
const BLOCK_TAGS = new Set([
	"p", "div", "section", "article", "main", "li", "ul", "ol", "dl", "dt", "dd", "table", "thead", "tbody", "tr", "h1", "h2", "h3", "h4", "h5", "h6",
	"pre", "blockquote", "br", "hr", "details", "summary", "figure", "figcaption", "address", "fieldset",
]);
// Class, id or role fragments that mark chrome rather than content.
const DROP_CLASS = /(^|[\s_-])(sidebar|toc|toctree|breadcrumb|breadcrumbs|headerlink|footer|nav|navbar|menu|cookie|rst-footer-buttons|related-pages|bottom-of-page|sphinx-tabs-tab|wy-nav|site-header|sr-only|visually-hidden|skip-link|edit-this-page|prev-next|page-feedback|feedback|announcement|search)([\s_-]|$)/i;
const KEEP_CLASS = /(^|\s)(document|rst-content|blog-post|blog-title|page-body|content)(\s|$)/i;
const NOISE_LINES = /^(previous|next|last updated.*|was this helpful\??|yes|no|on this page|copy|edit on github|¶|#|table of contents)$/i;

const ENTITIES: Record<string, string> = {
	amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", trade: "™", mdash: "-", ndash: "-", hellip: "...",
	rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', deg: "°", times: "x", micro: "µ", para: "", middot: "·", bull: "•", laquo: "«", raquo: "»",
	ouml: "ö", uuml: "ü", auml: "ä", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ntilde: "ñ", szlig: "ß", plusmn: "±", frac12: "½", frac14: "¼",
};

export function decodeEntities(s: string): string {
	return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, code: string) => {
		if (code[0] === "#") {
			const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
			return Number.isFinite(n) ? String.fromCodePoint(n) : m;
		}
		return ENTITIES[code] ?? ENTITIES[code.toLowerCase()] ?? m;
	});
}

export function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

// #region Tokenizer
export interface Section {
	level: number; // 1..3, 0 for text before the first heading
	heading: string;
	slug: string;
	lines: string[];
}

interface OpenEl {
	tag: string;
	drop: boolean;
	pre: boolean;
	heading: number; // 1..6 or 0
	li: boolean;
	cell: boolean;
	row: boolean;
	main: boolean;
}

function attr(attrs: string, name: string): string | null {
	const m = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
	return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}

function stripRaw(html: string): string {
	let out = html.replace(/<!--[\s\S]*?-->/g, "");
	for (const t of RAW_TAGS) out = out.replace(new RegExp(`<${t}\\b[\\s\\S]*?<\\/${t}\\s*>`, "gi"), "");
	return out;
}

export interface ExtractOptions {
	/** Only keep content inside the first element matching one of these (tag, or attribute test). */
	mainSelectors?: ((tag: string, attrs: string) => boolean)[];
}

const DEFAULT_MAIN: ExtractOptions["mainSelectors"] = [
	(t) => t === "main",
	(_t, a) => /role\s*=\s*["']?main/i.test(a),
	(t) => t === "article",
	(_t, a) => /id\s*=\s*["']?(content|main-content|main)\b/i.test(a),
	(t) => t === "body",
];

/**
 * Walk the page and produce sections: a heading (h1..h3 start a new one) plus the text lines under it.
 * h4+ headings stay inline as a bold-ish line so their words are still searchable.
 */
export function extractSections(html: string, opts: ExtractOptions = {}): { title: string; sections: Section[] } {
	const src = stripRaw(html);
	const selectors = opts.mainSelectors ?? DEFAULT_MAIN!;
	const stack: OpenEl[] = [];
	const sections: Section[] = [{ level: 0, heading: "", slug: "", lines: [] }];
	let cur = sections[0];
	let title = "";
	let mainFound = false;
	let line = "";
	let headingBuf: string | null = null;
	let headingId = "";
	let headingLevel = 0;
	let preBuf: string | null = null;
	let cellBuf: string[] | null = null;
	let listDepth = 0;

	// Chrome detection only applies inside the main element: page wrappers often carry classes like "wy-grid-for-nav".
	const inDrop = () => {
		const start = stack.findIndex((e) => e.main);
		return start !== -1 && stack.slice(start + 1).some((e) => e.drop);
	};
	const inMain = () => stack.some((e) => e.main);
	// Pick the highest-priority selector that matches anywhere in the page, so <body> never wins over <article>.
	const startTags = [...src.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^>]*)?)\/?>/g)];
	const selector = selectors.find((sel) => startTags.some((t) => sel(t[1].toLowerCase(), t[2] ?? ""))) ?? ((t) => t === "body");
	const flushLine = () => {
		// A bare list bullet means the <li> wraps a block child; keep the prefix for that child's text.
		if (/^\s*-\s*$/.test(line)) return;
		const t = line.replace(/\s+/g, " ").trim();
		line = "";
		if (!t) return;
		if (cellBuf) {
			cellBuf.push(t);
			return;
		}
		cur.lines.push(t);
	};
	const startSection = (level: number, heading: string, id: string) => {
		flushLine();
		if (level === 1 && !title) {
			title = heading;
			// Keep the h1 as the page title; text after it stays in the intro section.
			return;
		}
		if (level <= 3) {
			cur = { level, heading, slug: id || slugify(heading), lines: [] };
			sections.push(cur);
		} else {
			cur.lines.push(heading);
		}
	};

	const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^>]*)?)\/?>/g;
	let pos = 0;
	let m: RegExpExecArray | null;
	const emitText = (raw: string) => {
		if (!raw) return;
		if (inDrop() || !inMain()) return;
		const text = decodeEntities(raw);
		if (preBuf !== null) {
			preBuf += text;
			return;
		}
		if (headingBuf !== null) {
			headingBuf += text;
			return;
		}
		line += text;
	};

	while ((m = tagRe.exec(src))) {
		emitText(src.slice(pos, m.index));
		pos = m.index + m[0].length;
		const full = m[0];
		const tag = m[1].toLowerCase();
		const attrs = m[2] ?? "";
		const closing = full.startsWith("</");
		const selfClosing = full.endsWith("/>") || VOID_TAGS.has(tag);

		if (closing) {
			// Pop to the matching open element (tolerates unclosed tags).
			const idx = stack.map((e) => e.tag).lastIndexOf(tag);
			if (idx === -1) continue;
			const closed = stack.splice(idx);
			for (const el of closed.reverse()) closeEl(el);
			continue;
		}

		const cls = `${attr(attrs, "class") ?? ""} ${attr(attrs, "id") ?? ""} ${attr(attrs, "role") ?? ""}`;
		const isMain = !mainFound && selector(tag, attrs);
		if (isMain) mainFound = true;
		const drop = !isMain && inMain() && (DROP_TAGS.has(tag) || (DROP_CLASS.test(cls) && !KEEP_CLASS.test(cls)) || (/aria-hidden\s*=\s*["']?true/i.test(attrs) && tag !== "span"));
		const heading = /^h[1-6]$/.test(tag) ? Number(tag[1]) : 0;
		// GitBook draws tables with role="row" / role="cell" divs.
		const role = (attr(attrs, "role") ?? "").toLowerCase();
		const isRow = tag === "tr" || role === "row";
		const isCell = tag === "td" || tag === "th" || role === "cell" || role === "columnheader" || role === "rowheader";
		const el: OpenEl = { tag, drop, pre: tag === "pre", heading, li: tag === "li", cell: isCell, row: isRow, main: isMain };

		if (!selfClosing) stack.push(el);
		if (drop || inDrop() || !inMain()) {
			if (selfClosing) continue;
			continue;
		}

		if (heading && preBuf === null) {
			flushLine();
			headingBuf = "";
			headingId = attr(attrs, "id") ?? "";
			headingLevel = heading;
		} else if (tag === "pre") {
			flushLine();
			preBuf = "";
		} else if (tag === "br") {
			if (preBuf !== null) preBuf += "\n";
			else flushLine();
		} else if (tag === "li") {
			flushLine();
			listDepth = stack.filter((e) => e.tag === "ul" || e.tag === "ol").length;
			line = "  ".repeat(Math.max(0, listDepth - 1)) + "- ";
		} else if (el.row) {
			flushLine();
			cellBuf = [];
		} else if (el.cell) {
			flushLine();
		} else if (tag === "hr") {
			flushLine();
		} else if (BLOCK_TAGS.has(tag) && preBuf === null) {
			flushLine();
		}
		if (selfClosing && tag !== "br" && tag !== "hr") {
			// nothing else to do for void elements
		}
	}
	emitText(src.slice(pos));
	while (stack.length) closeEl(stack.pop()!);
	flushLine();

	function closeEl(el: OpenEl) {
		if (el.drop) return;
		if (el.heading && headingBuf !== null) {
			const text = headingBuf.replace(/\s+/g, " ").replace(/[¶#]+$/g, "").trim();
			headingBuf = null;
			if (text) startSection(headingLevel, text, headingId);
			return;
		}
		if (el.pre && preBuf !== null) {
			const code = preBuf.replace(/^\n+|\s+$/g, "");
			preBuf = null;
			if (code) cur.lines.push("```\n" + code + "\n```");
			return;
		}
		if (el.cell) {
			flushLine();
			return;
		}
		if (el.row && cellBuf) {
			flushLine();
			const row = cellBuf.filter(Boolean).join(" | ");
			cellBuf = null;
			if (row) cur.lines.push(row);
			return;
		}
		if (el.li || BLOCK_TAGS.has(el.tag)) flushLine();
	}

	if (!title) {
		const t = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
		if (t) title = decodeEntities(t).split(/\s+[-—|·]\s+/)[0].trim();
	}
	for (const s of sections) s.lines = s.lines.filter((l) => !NOISE_LINES.test(l.trim()));
	return { title, sections: sections.filter((s) => s.lines.length > 0 || s.level > 0) };
}
// #endregion

// #region Chunking
export interface PageChunk {
	heading: string | null;
	slug: string;
	body: string;
}

const MIN_WORDS = 15; // below this a section is chrome, not content
const MERGE_BELOW = 300; // merge h3 siblings under one h2 until this many words
const SPLIT_ABOVE = 600; // split a section into parts when it exceeds this
const TARGET_PART = 450;

const wordCount = (s: string) => (s.match(/\S+/g) ?? []).length;

function splitLong(lines: string[]): string[][] {
	const parts: string[][] = [];
	let part: string[] = [];
	let words = 0;
	for (const l of lines) {
		const w = wordCount(l);
		if (words + w > TARGET_PART && part.length) {
			parts.push(part);
			part = [];
			words = 0;
		}
		part.push(l);
		words += w;
	}
	if (part.length) parts.push(part);
	return parts;
}

/** Group sections into search-sized chunks. Sub-headings folded into a chunk stay in the body as their own line. */
export function sectionsToChunks(sections: Section[]): PageChunk[] {
	// Fold h3 siblings into the preceding chunk while it is still short; never fold across an h2.
	const groups: { heading: string | null; slug: string; lines: string[]; words: number }[] = [];
	let h2Context: string | null = null;
	for (const s of sections) {
		const words = wordCount(s.lines.join(" "));
		if (s.level <= 2) h2Context = s.level === 2 ? s.heading : null;
		const last = groups[groups.length - 1];
		const canFold = s.level === 3 && last && last.words < MERGE_BELOW && last.heading !== null;
		if (canFold) {
			last.lines.push(s.heading, ...s.lines);
			last.words += words + wordCount(s.heading);
			continue;
		}
		const heading = s.level === 0 ? null : s.level === 3 && h2Context ? `${h2Context} > ${s.heading}` : s.heading;
		groups.push({ heading, slug: s.slug || (s.level === 0 ? "top" : slugify(s.heading)), lines: [...s.lines], words });
	}

	const chunks: PageChunk[] = [];
	const seen = new Map<string, number>();
	const uniqueSlug = (slug: string) => {
		const n = (seen.get(slug) ?? 0) + 1;
		seen.set(slug, n);
		return n === 1 ? slug : `${slug}-${n}`;
	};
	for (const g of groups) {
		if (g.words < MIN_WORDS) continue;
		const parts = g.words > SPLIT_ABOVE ? splitLong(g.lines) : [g.lines];
		parts.forEach((lines, i) => {
			chunks.push({ heading: g.heading, slug: uniqueSlug(i === 0 ? g.slug : `${g.slug}-${i + 1}`), body: lines.join("\n") });
		});
	}
	return chunks;
}

export interface PageToChunksOptions extends ExtractOptions {
	source: TroubleshootChunkInsert["source"];
	url: string;
	sourceDate?: Date | null;
	title?: string;
}

/** Full pipeline: HTML -> TroubleshootChunkInsert rows with source_key = url + "#" + slug. */
export function pageToChunks(html: string, opts: PageToChunksOptions): TroubleshootChunkInsert[] {
	const { title: extracted, sections } = extractSections(html, opts);
	const title = opts.title ?? extracted ?? opts.url;
	return sectionsToChunks(sections).map((c) => ({
		source: opts.source,
		source_key: `${opts.url}#${c.slug}`,
		url: opts.url,
		title,
		heading: c.heading,
		body: c.body,
		source_date: opts.sourceDate ?? null,
	}));
}
// #endregion
