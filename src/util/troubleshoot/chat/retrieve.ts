import { getAnthropic } from "../../anthropic";
import { searchChunks, type ChunkHit } from "../chunks";
import { PLANNER_MODEL, type TokenUsage } from "../pricing";
import { messageWords } from "./keywords";

export interface Retrieval {
	chunks: ChunkHit[];
	queries: string[];
	/** Planner call usage, billed at the planner model's rate. Null when the planner was skipped or failed. */
	plannerUsage: TokenUsage | null;
}

const PLANNER_PROMPT = `You write search queries for a full-text index of FRC robot troubleshooting documents (WPILib docs, roboRIO, Vivid radio, REV, CTRE, past CSA tickets, CSA Slack threads).
Given the conversation, output 2 to 4 short keyword queries, each 2 to 4 words, that would find the pages a field volunteer needs. Use the words the documentation uses (roboRIO, Status LED, brownout, CAN bus, Driver Station, VH-109). No sentences, no punctuation.
Output only a JSON array of strings.`;

/** Ask the planner model for short keyword queries. Falls back to the message words on any failure. */
async function planQueries(
	message: string,
	lastAssistant: string | undefined,
): Promise<{ queries: string[]; usage: TokenUsage | null }> {
	const fallback = { queries: [messageWords(message).slice(0, 8).join(" ")].filter(Boolean), usage: null };
	try {
		const client = getAnthropic();
		const context = lastAssistant ? `Previous answer:\n${lastAssistant.slice(0, 1500)}\n\n` : "";
		const response = await client.messages.create({
			model: PLANNER_MODEL,
			max_tokens: 256,
			system: PLANNER_PROMPT,
			messages: [{ role: "user", content: `${context}Volunteer says:\n${message}` }],
		});
		const text = response.content
			.filter((b): b is Extract<(typeof response.content)[number], { type: "text" }> => b.type === "text")
			.map((b) => b.text)
			.join("");
		const start = text.indexOf("[");
		const end = text.lastIndexOf("]");
		if (start < 0 || end < start) return fallback;
		const parsed: unknown = JSON.parse(text.slice(start, end + 1));
		const queries = Array.isArray(parsed)
			? parsed
					.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
					.map((q) => q.trim())
					.slice(0, 4)
			: [];
		if (queries.length === 0) return fallback;
		return { queries, usage: response.usage };
	} catch (err) {
		console.error("[troubleshoot retrieve] planner failed, using message words", err);
		return fallback;
	}
}

/**
 * Retrieve the top `limit` chunks for a turn. A cheap planner call turns the message into
 * short keyword queries; each runs as an exact (AND) search. If that comes up short, one
 * broad (OR) search over all the query words fills the rest, ranked by how many words match.
 */
export async function retrieveChunks(
	message: string,
	lastAssistant: string | undefined,
	limit = 6,
): Promise<Retrieval> {
	const { queries, usage } = await planQueries(message, lastAssistant);
	const seen = new Map<string, ChunkHit>();
	const perQuery = Math.max(2, Math.ceil(limit / queries.length));
	for (const q of queries) {
		for (const hit of await searchChunks(q, perQuery, "and")) {
			if (!seen.has(hit.id)) seen.set(hit.id, hit);
		}
	}
	if (seen.size < limit) {
		const broad = [...new Set(queries.join(" ").split(/\s+/))].join(" ");
		for (const hit of await searchChunks(broad, limit * 2, "or")) {
			if (seen.size >= limit) break;
			if (!seen.has(hit.id)) seen.set(hit.id, hit);
		}
	}
	return { chunks: [...seen.values()].slice(0, limit), queries, plannerUsage: usage };
}
