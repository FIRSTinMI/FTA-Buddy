// Turns ingested Slack CSA threads into a clean, anonymized troubleshooting document per category.
//
// A "category" is a Slack channel name (cpp, electrical, networking, ...). The poller marks a
// category dirty in Redis when a pass fetched at least one thread for it. runDistillation reads that
// set and regenerates only the dirty categories, then clears each after a successful rebuild. It
// makes zero LLM calls when nothing is dirty. When a category does distill, a cheap Haiku triage
// call picks the writer tier, so simple topics stay cheap and only complex ones spend Sonnet/Opus.

import { and, eq, like } from "drizzle-orm";
import { db } from "../../db/db";
import { troubleshootChunks, troubleshootDocs } from "../../db/schema";
import { redis } from "../redis";
import { anthropicConfigured, getAnthropic } from "../anthropic";
import { PLANNER_MODEL, SONNET_MODEL, TROUBLESHOOT_MODEL, type TroubleshootModel } from "./pricing";
import { assertBudget, recordMonthlySpend } from "./spend";
import { upsertChunks } from "./chunks";

// #region Config
/** Redis set of category names that changed since their last distillation. */
export const DIRTY_SET_KEY = "ftabuddy:troubleshoot:distill:dirty";

/** A category needs at least this many threads before it is worth documenting at all. */
const MIN_THREADS = 2;

function enabled(): boolean {
	const v = (process.env.TROUBLESHOOT_DISTILL_ENABLED ?? "true").toLowerCase();
	return !["0", "false", "no", "off"].includes(v);
}
// #endregion

// #region Model routing
type Tier = "haiku" | "sonnet" | "opus";

const TIER_MODELS: Record<Tier, TroubleshootModel> = {
	haiku: PLANNER_MODEL,
	sonnet: SONNET_MODEL,
	opus: TROUBLESHOOT_MODEL,
};

const TRIAGE_SYSTEM = `You route a batch of support threads to the right writer model. Reply with exactly one lowercase word and nothing else:
- "haiku" when the threads are few and simple: quick questions with one clear fix each.
- "sonnet" when there are several threads with moderate technical nuance worth careful synthesis.
- "opus" when the threads are many, interrelated, or need subtle multi-step technical reasoning that benefits from the strongest model.
Output only one of: haiku, sonnet, opus.`;

/** First haiku|sonnet|opus token wins; anything unexpected defaults to sonnet. */
function parseTier(text: string): Tier {
	const m = /\b(haiku|sonnet|opus)\b/.exec(text.toLowerCase());
	return (m?.[1] as Tier) ?? "sonnet";
}

const TRIAGE_TRUNCATE = 600;

async function triageTier(category: string, threads: { title: string; body: string }[]): Promise<Tier> {
	await assertBudget();
	const client = getAnthropic();
	const sample = threads
		.map((t, i) => `Thread ${i + 1}: ${t.title}\n${t.body.slice(0, TRIAGE_TRUNCATE)}`)
		.join("\n\n");
	const res = await client.messages.create({
		model: PLANNER_MODEL,
		max_tokens: 16,
		system: TRIAGE_SYSTEM,
		messages: [{ role: "user", content: `Category: ${category}\nThread count: ${threads.length}\n\n${sample}` }],
	});
	await recordMonthlySpend(res.usage, PLANNER_MODEL);
	return parseTier(textOf(res));
}
// #endregion

// #region Writer
const SYSTEM_PROMPT = `You write concise internal troubleshooting notes for FRC field support volunteers (CSAs).
You are given real support threads from one topic, already anonymized. Write a short reference document.

Rules:
- Group the threads into the recurring problems they describe. Order by how often each comes up.
- Write each problem as three short parts with these exact bold labels: **Problem**, **Cause**, **Fix**.
- Keep any named attribution that already appears in the text (for example "Omar (CTRE)"). Do not add names that are not there.
- Never invent facts. If the threads do not settle a cause or fix, say what was tried and leave it at that.
- No team numbers, no event names, no personal names beyond the named vendor and FIRST staff already in the text.
- Plain markdown only: short headings, short paragraphs, and lists. No tables. No preamble, no closing summary.
- Do not use em dashes. Never use the word "AI".
- Skip threads that carry no troubleshooting value.`;

function buildUserPrompt(category: string, threads: { title: string; body: string }[]): string {
	const parts = threads.map((t, i) => `### Thread ${i + 1}: ${t.title}\n${t.body}`);
	return (
		`Topic: ${category}\n\n` +
		`Write the troubleshooting document for this topic from the ${threads.length} threads below. ` +
		`Start with a single "# ${titleCase(category)}" heading, then the problems.\n\n` +
		parts.join("\n\n")
	);
}

async function writeDoc(model: TroubleshootModel, category: string, threads: { title: string; body: string }[]): Promise<string> {
	await assertBudget();
	const client = getAnthropic();
	const res = await client.messages.create({
		model,
		max_tokens: 4000,
		system: SYSTEM_PROMPT,
		messages: [{ role: "user", content: buildUserPrompt(category, threads) }],
	});
	await recordMonthlySpend(res.usage, model);
	return textOf(res).trim();
}

function textOf(res: { content: Array<{ type: string }> }): string {
	return (res.content as Array<{ type: string; text?: string }>)
		.filter((b) => b.type === "text" && typeof b.text === "string")
		.map((b) => b.text as string)
		.join("\n");
}

/** "ds_and_dashboards" -> "Ds And Dashboards"; readable without inventing words. */
export function titleCase(category: string): string {
	return category
		.split(/[_\s-]+/)
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}
// #endregion

// #region Gather
/** All slack chunks whose title is "#<category>: ..." are the threads for that category. */
async function gatherThreads(category: string) {
	return db
		.select({
			title: troubleshootChunks.title,
			body: troubleshootChunks.body,
			url: troubleshootChunks.url,
		})
		.from(troubleshootChunks)
		.where(and(eq(troubleshootChunks.source, "slack"), like(troubleshootChunks.title, `#${category}:%`)));
}
// #endregion

// #region Run
/**
 * Regenerate the docs for every dirty category. Returns the number actually distilled (an LLM call
 * was made). Zero LLM calls when the dirty set is empty. A category with fewer than 2 threads is
 * cleared without spending. On any failure the category stays dirty so the next pass retries it.
 */
export async function runDistillation(): Promise<number> {
	if (!enabled()) return 0;
	if (!anthropicConfigured) return 0;

	const dirty = await redis.smembers(DIRTY_SET_KEY);
	if (dirty.length === 0) return 0;

	let processed = 0;
	for (const category of dirty) {
		try {
			const threads = await gatherThreads(category);
			if (threads.length < MIN_THREADS) {
				// One lone thread is not documentation yet. Clear it; a new thread re-dirties it later.
				await redis.srem(DIRTY_SET_KEY, category);
				continue;
			}

			const forWriter = threads.map((t) => ({ title: t.title, body: t.body }));
			const tier = await triageTier(category, forWriter);
			const model = TIER_MODELS[tier];
			console.log(`[Distill] ${category}: ${threads.length} threads -> ${tier} (${model})`);

			const body = await writeDoc(model, category, forWriter);
			if (!body) {
				// Empty output: leave dirty and retry next pass rather than store nothing.
				continue;
			}

			const sourceUrls = threads.map((t) => t.url).filter((u): u is string => !!u);
			const title = `${titleCase(category)} notes from CSA discussion`;
			const now = new Date();

			// (a) The browsable doc row.
			await db
				.insert(troubleshootDocs)
				.values({
					category,
					title,
					body,
					source_urls: sourceUrls,
					thread_count: threads.length,
					updated_at: now,
				})
				.onConflictDoUpdate({
					target: troubleshootDocs.category,
					set: { title, body, source_urls: sourceUrls, thread_count: threads.length, updated_at: now },
				});

			// (b) A corpus chunk so the chat retrieves the distilled notes.
			await upsertChunks([
				{
					source: "note",
					source_key: `distill:${category}`,
					url: null,
					title,
					heading: null,
					body,
					source_date: now,
				},
			]);

			await redis.srem(DIRTY_SET_KEY, category);
			processed++;
		} catch (err) {
			// Leave the category dirty so it retries next pass.
			console.error(`[Distill] ${category} failed:`, (err as Error).message);
		}
	}
	return processed;
}
// #endregion
