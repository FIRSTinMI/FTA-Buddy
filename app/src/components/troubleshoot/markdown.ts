// Small, safe markdown subset for assistant answers. Every character of input is
// HTML-escaped first; the only tags in the output are ones this file writes, and
// link hrefs are restricted to http(s). No dependencies.

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const SAFE_HREF = /^https?:\/\/[^\s"'<>]+$/i;

/** Inline: code, bold, italic, links. Input is already escaped. */
export function renderInline(escaped: string): string {
	// Protect inline code from further formatting. NUL cannot appear in escaped user
	// text, so it is a safe placeholder delimiter.
	const codes: string[] = [];
	let out = escaped.replace(/`([^`\n]+)`/g, (_, c: string) => {
		codes.push(`<code>${c}</code>`);
		return `\u0000${codes.length - 1}\u0000`;
	});
	out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, text: string, href: string) => {
		// The href was escaped with the rest of the text; &amp; in a URL is still a valid URL.
		if (!SAFE_HREF.test(href)) return m;
		return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
	});
	out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
	out = out.replace(/(^|[^*\w])\*([^*\n]+)\*(?=$|[^*\w])/g, "$1<em>$2</em>");
	out = out.replace(/(^|[^_\w])_([^_\n]+)_(?=$|[^_\w])/g, "$1<em>$2</em>");
	return out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)] ?? "");
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[]; start: number };

/** Block level: paragraphs, ordered and unordered lists. Headings become bold paragraphs. */
export function renderMarkdown(src: string): string {
	const lines = escapeHtml(src.replace(/\r\n?/g, "\n")).split("\n");
	const blocks: Block[] = [];
	let cur: Block | null = null;
	const flush = () => {
		if (cur) blocks.push(cur);
		cur = null;
	};

	for (const raw of lines) {
		const line = raw.trimEnd();
		if (line.trim() === "") {
			flush();
			continue;
		}
		const ol = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
		const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
		const h = /^\s*#{1,6}\s+(.*)$/.exec(line);
		if (ol) {
			if (cur?.kind !== "ol") {
				flush();
				cur = { kind: "ol", items: [], start: Number(ol[1]) || 1 };
			}
			cur.items.push(ol[2]);
		} else if (ul) {
			if (cur?.kind !== "ul") {
				flush();
				cur = { kind: "ul", items: [], start: 1 };
			}
			cur.items.push(ul[1]);
		} else if (h) {
			flush();
			blocks.push({ kind: "p", lines: [`<strong>${h[1]}</strong>`] });
		} else if (cur && cur.kind !== "p" && /^\s{2,}/.test(raw)) {
			// Indented continuation of the previous list item.
			cur.items[cur.items.length - 1] += " " + line.trim();
		} else {
			if (cur?.kind !== "p") {
				flush();
				cur = { kind: "p", lines: [] };
			}
			cur.lines.push(line.trim());
		}
	}
	flush();

	return blocks
		.map((b) => {
			if (b.kind === "p") return `<p>${b.lines.map(renderInline).join("<br>")}</p>`;
			const items = b.items.map((i) => `<li>${renderInline(i)}</li>`).join("");
			return b.kind === "ol" ? `<ol start="${b.start}">${items}</ol>` : `<ul>${items}</ul>`;
		})
		.join("");
}
