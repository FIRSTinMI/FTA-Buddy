// Turns ingested CSA material (Slack threads and resolved tickets) into a clean, anonymized
// troubleshooting document per TOPIC. Topics are the things a CSA actually looks up (roboRIO, radio,
// power, CAN, code, Driver Station, field and FMS), not the Slack channel a thread happened to land in.
//
// Incremental and cheap: a chunk is classified into a topic once (its `heading`), by a cheap Haiku
// call, and only topics that gained material are rewritten. A quiet week classifies nothing and makes
// zero LLM calls. When a topic is rewritten, a Haiku triage call picks the writer tier so simple
// topics stay cheap and only genuinely complex ones spend a bigger model.

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db/db";
import { troubleshootChunks, troubleshootDocs } from "../../db/schema";
import { anthropicConfigured, getAnthropic } from "../anthropic";
import { upsertChunks } from "./chunks";
import { PLANNER_MODEL, SONNET_MODEL, TROUBLESHOOT_MODEL, type TroubleshootModel } from "./pricing";
import { assertBudget, recordMonthlySpend } from "./spend";

// #region Config
/** Even one good thread is worth documenting, so nothing gets orphaned. */
const MIN_ITEMS = 1;
/** Cap the material fed into one document so a big topic cannot blow up a prompt. */
const MAX_ITEMS_PER_DOC = 40;
/** How many chunks to classify in one Haiku call. */
const CLASSIFY_BATCH = 30;
/** Cap classification work per run so a first run over a full ticket history stays bounded. */
const MAX_CLASSIFY_PER_RUN = 240;

function enabled(): boolean {
	const v = (process.env.TROUBLESHOOT_DISTILL_ENABLED ?? "true").toLowerCase();
	return !["0", "false", "no", "off"].includes(v);
}

export const TOPICS = ["roborio", "radio", "power", "can", "code", "driver-station", "field-network", "other"] as const;
export type Topic = (typeof TOPICS)[number];

const TOPIC_LABELS: Record<Topic, string> = {
	roborio: "roboRIO",
	radio: "Radio",
	power: "Power and wiring",
	can: "CAN bus",
	code: "Robot code",
	"driver-station": "Driver Station",
	"field-network": "Field and FMS",
	other: "Other",
};

type Tier = "haiku" | "sonnet" | "opus";
const TIER_MODELS: Record<Tier, TroubleshootModel> = {
	haiku: PLANNER_MODEL,
	sonnet: SONNET_MODEL,
	opus: TROUBLESHOOT_MODEL,
};
// #endregion

// #region LLM helpers
function textOf(res: { content: Array<{ type: string }> }): string {
	return (res.content as Array<{ type: string; text?: string }>)
		.filter((b) => b.type === "text" && typeof b.text === "string")
		.map((b) => b.text as string)
		.join("\n");
}

const CLASSIFY_SYSTEM = `You sort FRC field-support notes into topics. For each numbered item reply with one line "<number>=<topic>".
Topics: ${TOPICS.join(", ")}.
Use roborio for the controller itself, radio for the VH-109 and the wireless link, power for batteries, breakers, PDH/PDP and wiring, can for CAN bus and device IDs, code for robot code, deploys and crashes, driver-station for the DS laptop and joysticks, field-network for FMS and field connectivity, other only when nothing else fits. Reply with the lines and nothing else.`;

/** Assign a topic to each unclassified chunk. One cheap call per batch. */
async function classifyBatch(items: { id: string; title: string; body: string }[]): Promise<Map<string, Topic>> {
	const out = new Map<string, Topic>();
	await assertBudget();
	const client = getAnthropic();
	const listing = items.map((it, i) => `${i + 1}. ${it.title}\n${it.body.slice(0, 240)}`).join("\n\n");
	const res = await client.messages.create({
		model: PLANNER_MODEL,
		max_tokens: 1000,
		system: CLASSIFY_SYSTEM,
		messages: [{ role: "user", content: listing }],
	});
	await recordMonthlySpend(res.usage, PLANNER_MODEL);
	for (const line of textOf(res).split("\n")) {
		const m = /^\s*(\d+)\s*=\s*([a-z-]+)/.exec(line);
		if (!m) continue;
		const idx = parseInt(m[1], 10) - 1;
		const topic = m[2] as Topic;
		if (items[idx] && (TOPICS as readonly string[]).includes(topic)) out.set(items[idx].id, topic);
	}
	// Anything the model skipped falls back to "other" so it is never reclassified forever.
	for (const it of items) if (!out.has(it.id)) out.set(it.id, "other");
	return out;
}

const TRIAGE_SYSTEM = `You route a batch of support notes to the right writer model. Reply with exactly one lowercase word and nothing else:
haiku when the notes are few and simple, sonnet when there are several with moderate technical nuance, opus when they are many, interrelated, or need subtle multi-step reasoning.`;

async function triageTier(topic: string, items: { title: string; body: string }[]): Promise<Tier> {
	await assertBudget();
	const client = getAnthropic();
	const sample = items.map((t, i) => `### ${i + 1}: ${t.title}\n${t.body.slice(0, 600)}`).join("\n\n");
	const res = await client.messages.create({
		model: PLANNER_MODEL,
		max_tokens: 16,
		system: TRIAGE_SYSTEM,
		messages: [{ role: "user", content: `Topic: ${topic}\nCount: ${items.length}\n\n${sample}` }],
	});
	await recordMonthlySpend(res.usage, PLANNER_MODEL);
	const m = /\b(haiku|sonnet|opus)\b/.exec(textOf(res).toLowerCase());
	return (m?.[1] as Tier) ?? "sonnet";
}

const SYSTEM_PROMPT = `You write concise internal troubleshooting notes for FRC field support volunteers (CSAs).
Group the material into the recurring problems it shows. For each problem write "**Problem:**", "**Cause:**" and "**Fix:**".

Rules:
- Only write up an item when the material actually states a cause or a fix. Skip anything that does not. Never write "Not stated", "Status unclear", "Unknown", or "Could not find the team". A note with nothing to teach is worse than no note.
- Merge items that describe the same underlying problem into one entry. Prefer a few solid entries over many thin ones.
- Never write a person's name. The material contains volunteer first names and initials; leave every one of them out, including who was sent or who handled it. Write what was wrong and what fixed it, not who did it. The only exception is a vendor or FIRST staff member already attributed in the text as "Name (FIRST)", "Name (CTRE)" or "Name (REV)", which you may keep.
- Never name a team or an event, and do not include team numbers.
- Only use what the material states. Do not invent causes or fixes.
Short sentences, plain words, no em dashes. Output markdown.`;

function buildUserPrompt(topic: Topic, items: { title: string; body: string }[]): string {
	const parts = items.map((t, i) => `### Item ${i + 1}: ${t.title}\n${t.body}`);
	return (
		`Topic: ${TOPIC_LABELS[topic]}\n\n` +
		`Write the notes for this topic. Start with a single "# ${TOPIC_LABELS[topic]}" heading, then the problems.\n\n` +
		parts.join("\n\n")
	);
}

async function writeDoc(
	model: TroubleshootModel,
	topic: Topic,
	items: { title: string; body: string }[],
): Promise<string> {
	await assertBudget();
	const client = getAnthropic();
	const res = await client.messages.create({
		model,
		max_tokens: 4000,
		system: SYSTEM_PROMPT,
		messages: [{ role: "user", content: buildUserPrompt(topic, items) }],
	});
	await recordMonthlySpend(res.usage, model);
	return textOf(res).trim();
}
// #endregion

// #region Data
const SOURCE_FILTER = or(eq(troubleshootChunks.source, "slack"), eq(troubleshootChunks.source, "ticket"));

// Words that show a ticket actually reached a cause or a fix. A ticket without one of these is
// chatter ("on my way", "could not find the team") and makes a worthless entry, so it is not
// distilled. Slack threads are discussions and carry their own reasoning, so they are kept.
const RESOLVED_RE =
	"(fixed|resolved|replaced|swapped|reseat|reseated|tighten|tightened|reimag|reflash|re-?crimp|turned out|was the|root cause|corrected|loose|broken|shorted|blew|blown|unplugged|backwards|reversed|firmware|current limit|reboot)";

/** Material worth writing up: any slack thread, or a ticket that shows a real cause or fix. */
const WORTH_DISTILLING = and(
	SOURCE_FILTER,
	sql`(${troubleshootChunks.source} = 'slack' OR (${troubleshootChunks.body} ~* ${RESOLVED_RE} AND length(${troubleshootChunks.body}) >= 120))`,
);

/** Material that has not been sorted into a topic yet. */
async function unclassified(limit: number) {
	return db
		.select({ id: troubleshootChunks.id, title: troubleshootChunks.title, body: troubleshootChunks.body })
		.from(troubleshootChunks)
		.where(and(SOURCE_FILTER, isNull(troubleshootChunks.heading)))
		.limit(limit);
}

/** Everything filed under a topic, longest first so a capped doc keeps the substantial material. */
async function itemsForTopic(topic: Topic) {
	return db
		.select({ title: troubleshootChunks.title, body: troubleshootChunks.body, url: troubleshootChunks.url })
		.from(troubleshootChunks)
		.where(and(WORTH_DISTILLING, eq(troubleshootChunks.heading, topic)))
		.orderBy(sql`length(${troubleshootChunks.body}) desc`)
		.limit(MAX_ITEMS_PER_DOC);
}
// #endregion

// #region Run
/**
 * Classify any new material, then rewrite only the topics that gained something (or have no doc yet).
 * Returns how many topic documents were written. Zero LLM calls when there is nothing new.
 */
export async function runDistillation(): Promise<number> {
	if (!enabled() || !anthropicConfigured) return 0;

	// 1. Sort new material into topics. Cheap, and only ever done once per chunk.
	const pending = await unclassified(MAX_CLASSIFY_PER_RUN);
	const touched = new Set<Topic>();
	for (let i = 0; i < pending.length; i += CLASSIFY_BATCH) {
		const batch = pending.slice(i, i + CLASSIFY_BATCH);
		try {
			const assigned = await classifyBatch(batch);
			for (const [id, topic] of assigned) {
				await db.update(troubleshootChunks).set({ heading: topic }).where(eq(troubleshootChunks.id, id));
				touched.add(topic);
			}
		} catch (err) {
			console.error("[Distill] classify batch failed:", (err as Error).message);
		}
	}

	// 2. Topics that gained material, plus any topic that has material but no document yet.
	const existing = await db.select({ category: troubleshootDocs.category }).from(troubleshootDocs);
	const haveDocs = new Set(existing.map((d) => d.category));
	const counts = await db
		.select({ topic: troubleshootChunks.heading, n: sql<number>`count(*)::int` })
		.from(troubleshootChunks)
		.where(and(WORTH_DISTILLING, inArray(troubleshootChunks.heading, [...TOPICS])))
		.groupBy(troubleshootChunks.heading);
	for (const row of counts) {
		if (row.topic && !haveDocs.has(row.topic) && row.n >= MIN_ITEMS) touched.add(row.topic as Topic);
	}
	if (touched.size === 0) return 0;

	// 3. Rewrite just those topics.
	let processed = 0;
	for (const topic of touched) {
		try {
			const items = await itemsForTopic(topic);
			if (items.length < MIN_ITEMS) continue;

			const forWriter = items.map((t) => ({ title: t.title, body: t.body }));
			const tier = await triageTier(topic, forWriter);
			const model = TIER_MODELS[tier];
			console.log(`[Distill] ${topic}: ${items.length} items -> ${tier} (${model})`);

			const body = await writeDoc(model, topic, forWriter);
			if (!body) continue;

			const sourceUrls = items.map((t) => t.url).filter((u): u is string => !!u);
			const title = `${TOPIC_LABELS[topic]} notes from CSA tickets and Slack`;
			const now = new Date();

			await db
				.insert(troubleshootDocs)
				.values({
					category: topic,
					title,
					body,
					source_urls: sourceUrls,
					thread_count: items.length,
					updated_at: now,
				})
				.onConflictDoUpdate({
					target: troubleshootDocs.category,
					set: { title, body, source_urls: sourceUrls, thread_count: items.length, updated_at: now },
				});

			// A corpus chunk so the chat retrieves the distilled notes too.
			await upsertChunks([
				{
					source: "note",
					source_key: `distill:${topic}`,
					url: null,
					title,
					heading: null,
					body,
					source_date: now,
				},
			]);
			processed++;
		} catch (err) {
			console.error(`[Distill] ${topic} failed:`, (err as Error).message);
		}
	}
	return processed;
}
// #endregion
