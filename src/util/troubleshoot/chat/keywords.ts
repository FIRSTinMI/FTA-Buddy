// Pure helpers for query building. No DB imports so they can be unit tested.

export const STOPWORDS = new Set(
	`the a an and or but if then else of to in on at for from by with without as is are was were be been being it its this that these those there here you your they them their we our i me my he she his her not no yes do does did done have has had having can could should would will may might must shall into onto over under again more most less least very just only also than too so such what which who whom whose when where why how all any each few some both either neither one two three first next last after before while during about above below between through step steps check make sure try turn see look find open close set get put use using used still same other another`.split(
		/\s+/,
	),
);

/**
 * Pull a handful of distinctive words out of the last assistant answer so the
 * follow-up ("it's still red", "what about the other one") still retrieves the
 * right documents. Markdown and punctuation are stripped first.
 */
export function assistantKeywords(text: string | undefined, max = 8): string[] {
	if (!text) return [];
	const counts = new Map<string, number>();
	for (const raw of text.toLowerCase().split(/[^a-z0-9-]+/)) {
		const w = raw.replace(/^-+|-+$/g, "");
		if (w.length < 4 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
		counts.set(w, (counts.get(w) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, max)
		.map(([w]) => w);
}

/** Words from the user's message worth searching on, lowercased, stopwords removed. */
export function messageWords(message: string): string[] {
	return message
		.toLowerCase()
		.split(/[^a-z0-9.-]+/)
		.map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
		.filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** Build the broad "a or b or c" fallback query. Empty string when nothing is left. */
export function broadQuery(message: string, lastAssistant: string | undefined): string {
	return [...new Set([...messageWords(message), ...assistantKeywords(lastAssistant)])].join(" or ");
}
