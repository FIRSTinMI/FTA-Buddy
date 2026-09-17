import { TRPCError } from "@trpc/server";
import Anthropic from "@anthropic-ai/sdk";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import { troubleshootChunks, troubleshootConversations, troubleshootDocs, troubleshootMessages } from "../db/schema";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { runDistillation } from "../util/troubleshoot/distill";
import { streamAnswer } from "../util/troubleshoot/chat/answer";
import { assertChatEnabled, isChatEnabled, setChatEnabled } from "../util/troubleshoot/chat/enabled";
import { parseRepoFromTurns } from "../util/troubleshoot/chat/github";
import { retrieveChunks } from "../util/troubleshoot/chat/retrieve";
import { searchEventTickets } from "../util/troubleshoot/chat/event-tickets";
import { SOURCE_LABELS, type ChatCitation, type ChatEvent } from "../util/troubleshoot/chat/types";
import { assertRateLimit } from "../util/troubleshoot/rate-limit";
import {
	addRepoReads,
	addUploadReads,
	assertBudget,
	getRepoReads,
	getUploadReads,
	getSpendStatus,
	recordSpend,
	TROUBLESHOOT_MODEL,
} from "../util/troubleshoot/spend";
import { PLANNER_MODEL } from "../util/troubleshoot/pricing";
import { findUpload, uploadCodeFromTurns, type UploadRef } from "../util/troubleshoot/chat/uploads";
import { ghostCsaEnabled, sendUploadToGhostCsa } from "../util/uploads/ghost-csa";
import { teamUploadFiles } from "../db/schema";

export type { ChatCitation, ChatEvent } from "../util/troubleshoot/chat/types";
export { SOURCE_LABELS };

/** A conversation is closed to new turns after this many user messages. */
const MAX_USER_TURNS = 8;
const MAX_MESSAGE_CHARS = 800;
const RETRIEVE_LIMIT = 6;

/** Corpus sources a user may page through. Tickets and Slack stay out; they are only distilled. */
const BROWSABLE_SOURCES = ["wpilib", "rev", "ctre", "vivid"] as const;

function firstForwardedIp(ip: string | undefined): string | null {
	if (!ip) return null;
	const first = ip.split(",")[0]?.trim();
	return first ? first.slice(0, 64) : null;
}

/** Resolve chunk ids to the citation shape the UI renders. Missing chunks are skipped. */
async function citationsFor(chunkIds: string[]): Promise<ChatCitation[]> {
	if (chunkIds.length === 0) return [];
	const rows = await db
		.select({
			id: troubleshootChunks.id,
			url: troubleshootChunks.url,
			title: troubleshootChunks.title,
			source: troubleshootChunks.source,
		})
		.from(troubleshootChunks)
		.where(inArray(troubleshootChunks.id, chunkIds));
	const byId = new Map(rows.map((r) => [r.id, r]));
	return chunkIds
		.map((id) => byId.get(id))
		.filter((r): r is NonNullable<typeof r> => r != null)
		.map((r) => ({ chunkId: r.id, url: r.url, title: r.title, source: r.source }));
}

async function ownedConversation(conversationId: string, userId: number) {
	const conv = await db.query.troubleshootConversations.findFirst({
		where: and(eq(troubleshootConversations.id, conversationId), eq(troubleshootConversations.user_id, userId)),
	});
	if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
	return conv;
}

export const troubleshootRouter = router({
	/** The distilled knowledge base: one doc per Slack category. Public, no chat spend. */
	kb: publicProcedure.query(async () => {
		return db
			.select({
				category: troubleshootDocs.category,
				title: troubleshootDocs.title,
				thread_count: troubleshootDocs.thread_count,
				updated_at: troubleshootDocs.updated_at,
			})
			.from(troubleshootDocs)
			.orderBy(asc(troubleshootDocs.category));
	}),

	/** One distilled doc's markdown body and its source thread links. */
	kbDoc: publicProcedure.input(z.object({ category: z.string().min(1).max(80) })).query(async ({ input }) => {
		const doc = await db.query.troubleshootDocs.findFirst({
			where: eq(troubleshootDocs.category, input.category),
			columns: { category: true, title: true, body: true, source_urls: true, updated_at: true },
		});
		if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "No notes for that topic." });
		return doc;
	}),

	/** Which corpus sources can be browsed, with a page count each. */
	sources: publicProcedure.query(async () => {
		const rows = await db
			.select({
				source: troubleshootChunks.source,
				pages: sql<number>`count(distinct ${troubleshootChunks.url})::int`,
				chunks: count(),
				updated: sql<Date>`max(${troubleshootChunks.fetched_at})`,
			})
			.from(troubleshootChunks)
			.where(and(inArray(troubleshootChunks.source, BROWSABLE_SOURCES), isNotNull(troubleshootChunks.url)))
			.groupBy(troubleshootChunks.source);
		return rows.map((r) => ({ ...r, label: SOURCE_LABELS[r.source] ?? r.source }));
	}),

	/** Pages within one source, newest crawl first. `q` filters on the page title. */
	sourcePages: publicProcedure
		.input(
			z.object({
				source: z.enum(BROWSABLE_SOURCES),
				q: z.string().max(100).optional(),
				limit: z.number().int().min(1).max(200).default(200),
			}),
		)
		.query(async ({ input }) => {
			const where = [
				eq(troubleshootChunks.source, input.source),
				isNotNull(troubleshootChunks.url),
				...(input.q?.trim() ? [ilike(troubleshootChunks.title, `%${input.q.trim()}%`)] : []),
			];
			return db
				.select({
					url: troubleshootChunks.url,
					title: troubleshootChunks.title,
					sections: count(),
					updated: sql<Date>`max(${troubleshootChunks.fetched_at})`,
				})
				.from(troubleshootChunks)
				.where(and(...where))
				.groupBy(troubleshootChunks.url, troubleshootChunks.title)
				.orderBy(asc(troubleshootChunks.title))
				.limit(input.limit);
		}),

	/** One page, its sections joined back together in document order. */
	sourcePage: publicProcedure
		.input(z.object({ source: z.enum(BROWSABLE_SOURCES), url: z.string().url().max(500) }))
		.query(async ({ input }) => {
			const rows = await db
				.select({
					heading: troubleshootChunks.heading,
					body: troubleshootChunks.body,
					title: troubleshootChunks.title,
					fetched_at: troubleshootChunks.fetched_at,
					created_at: troubleshootChunks.created_at,
				})
				.from(troubleshootChunks)
				.where(and(eq(troubleshootChunks.source, input.source), eq(troubleshootChunks.url, input.url)))
				// created_at breaks the tie for rows crawled before `ordinal` existed, which all
				// default to 0. It holds the original insert order, which was document order.
				.orderBy(asc(troubleshootChunks.ordinal), asc(troubleshootChunks.created_at));
			if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "No such page." });
			return {
				title: rows[0].title,
				url: input.url,
				label: SOURCE_LABELS[input.source] ?? input.source,
				fetched_at: rows[0].fetched_at,
				sections: rows.map((r) => ({ heading: r.heading, body: r.body })),
			};
		}),

	/** Run distillation on demand (testing). Returns how many categories were regenerated. */
	distillNow: adminProcedure.mutation(async () => {
		const processed = await runDistillation();
		return { processed };
	}),

	/** Enabled flag plus month-to-date spend so the UI can show an unavailable card. */
	status: protectedProcedure.query(async () => {
		const [enabled, spend] = await Promise.all([isChatEnabled(), getSpendStatus()]);
		return { enabled, ...spend, maxUserTurns: MAX_USER_TURNS, maxMessageChars: MAX_MESSAGE_CHARS };
	}),

	/** Admin kill switch. Env TROUBLESHOOT_CHAT_ENABLED=false still wins. */
	setEnabled: adminProcedure.input(z.object({ enabled: z.boolean() })).mutation(async ({ input }) => {
		const enabled = await setChatEnabled(input.enabled);
		return { enabled };
	}),

	/** The user's recent conversations, newest first, with the opening message as preview. */
	list: protectedProcedure
		.input(
			z
				.object({
					limit: z.number().int().min(1).max(50).default(20),
					q: z.string().trim().max(120).optional(),
				})
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			// When searching, narrow to conversations whose messages contain the text.
			let matchIds: string[] | null = null;
			if (input?.q) {
				const hits = await db
					.selectDistinct({ id: troubleshootMessages.conversation_id })
					.from(troubleshootMessages)
					.where(ilike(troubleshootMessages.text, `%${input.q}%`));
				matchIds = hits.map((h) => h.id);
				if (matchIds.length === 0) return [];
			}
			const convs = await db
				.select({
					id: troubleshootConversations.id,
					created_at: troubleshootConversations.created_at,
					updated_at: troubleshootConversations.updated_at,
				})
				.from(troubleshootConversations)
				.where(
					matchIds
						? and(
								eq(troubleshootConversations.user_id, ctx.user.id),
								inArray(troubleshootConversations.id, matchIds),
							)
						: eq(troubleshootConversations.user_id, ctx.user.id),
				)
				.orderBy(desc(troubleshootConversations.updated_at))
				.limit(input?.limit ?? 20);
			if (convs.length === 0) return [];
			const firsts = await db
				.select({
					conversation_id: troubleshootMessages.conversation_id,
					text: troubleshootMessages.text,
					created_at: troubleshootMessages.created_at,
				})
				.from(troubleshootMessages)
				.where(
					and(
						inArray(
							troubleshootMessages.conversation_id,
							convs.map((c) => c.id),
						),
						eq(troubleshootMessages.role, "user"),
					),
				)
				.orderBy(asc(troubleshootMessages.created_at));
			const preview = new Map<string, string>();
			for (const m of firsts) if (!preview.has(m.conversation_id)) preview.set(m.conversation_id, m.text);
			return convs.map((c) => ({ ...c, preview: (preview.get(c.id) ?? "").slice(0, 120) }));
		}),

	/** All messages in one of the user's conversations, oldest first, with citations resolved. */
	history: protectedProcedure.input(z.object({ conversationId: z.string().uuid() })).query(async ({ ctx, input }) => {
		await ownedConversation(input.conversationId, ctx.user.id);
		const rows = await db
			.select()
			.from(troubleshootMessages)
			.where(eq(troubleshootMessages.conversation_id, input.conversationId))
			.orderBy(asc(troubleshootMessages.created_at));
		const allIds = [...new Set(rows.flatMap((r) => r.cited_chunk_ids))];
		const cites = await citationsFor(allIds);
		const byId = new Map(cites.map((c) => [c.chunkId, c]));
		const userTurns = rows.filter((r) => r.role === "user").length;
		return {
			conversationId: input.conversationId,
			closed: userTurns >= MAX_USER_TURNS,
			messages: rows.map((r) => ({
				id: r.id,
				role: r.role,
				text: r.text,
				created_at: r.created_at,
				citations: r.cited_chunk_ids.map((id) => byId.get(id)).filter((c): c is ChatCitation => c != null),
				// Present when the assistant ended that turn with a multiple-choice question.
				question: r.question ?? null,
			})),
		};
	}),

	/**
	 * One chat turn, streamed. Pre-checks throw (enabled, budget, rate limit, turn cap);
	 * anything after the API call starts is reported as an "error" event so the partial
	 * answer stays on screen.
	 */
	chat: protectedProcedure
		.input(
			z.object({
				conversationId: z.string().uuid().optional(),
				message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
				// "<treeId>/<nodeId>" when the user arrived from a guided tree.
				from: z.string().max(200).optional(),
				// Attaches a team's upload for this whole conversation. The app sets it
				// when the chat is opened from an upload; otherwise a code typed into
				// any message attaches it just as well.
				uploadId: z.string().uuid().optional(),
			}),
		)
		.subscription(async function* ({ ctx, input, signal }): AsyncGenerator<ChatEvent> {
			await assertChatEnabled();
			await assertBudget();
			await assertRateLimit(ctx.user.id);

			// Load or create the conversation.
			let conversationId = input.conversationId;
			if (conversationId) {
				await ownedConversation(conversationId, ctx.user.id);
			} else {
				const [created] = await db
					.insert(troubleshootConversations)
					.values({ user_id: ctx.user.id, ip: firstForwardedIp(ctx.ip), model: TROUBLESHOOT_MODEL })
					.returning({ id: troubleshootConversations.id });
				conversationId = created.id;
			}

			const prior = await db
				.select({ role: troubleshootMessages.role, text: troubleshootMessages.text })
				.from(troubleshootMessages)
				.where(eq(troubleshootMessages.conversation_id, conversationId))
				.orderBy(asc(troubleshootMessages.created_at));
			const userTurns = prior.filter((m) => m.role === "user").length;
			if (userTurns >= MAX_USER_TURNS) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: `This conversation has reached ${MAX_USER_TURNS} messages. Start a new one.`,
				});
			}

			const lastAssistant = [...prior].reverse().find((m) => m.role === "assistant")?.text;
			const retrieval = await retrieveChunks(input.message, lastAssistant, RETRIEVE_LIMIT);
			// Live tickets from the user's current event go first so the model prefers what is happening now.
			const eventCode = ctx.user.active_event_code;
			const eventTickets = eventCode ? await searchEventTickets(eventCode, input.message, 3).catch(() => []) : [];
			const docs = [...eventTickets, ...retrieval.chunks];
			if (retrieval.plannerUsage) {
				await recordSpend(conversationId, retrieval.plannerUsage, PLANNER_MODEL).catch((err) =>
					console.error("[troubleshoot chat] planner recordSpend failed", err),
				);
			}

			const userText =
				input.from && prior.length === 0
					? `${input.message}\n\n[Arrived from guided tree: ${input.from}]`
					: input.message;
			await db.insert(troubleshootMessages).values({
				conversation_id: conversationId,
				role: "user",
				text: userText,
				cited_chunk_ids: [],
			});

			// A pasted repo URL, from this message or any earlier user turn, attaches the repo tools.
			const userTexts = [...prior.filter((m) => m.role === "user").map((m) => m.text), userText];
			const repo = parseRepoFromTurns(userTexts);
			const repoReadsBefore = repo ? await getRepoReads(conversationId) : 0;

			// An upload attaches the same way: the app can name one outright, or an
			// upload code read off a sticky note in any message will do it.
			let upload: UploadRef | null = null;
			try {
				upload = await findUpload({
					id: input.uploadId,
					code: input.uploadId ? undefined : (uploadCodeFromTurns(userTexts) ?? undefined),
					eventCode: eventCode ?? null,
				});
			} catch (err) {
				console.error("[troubleshoot chat] upload lookup failed", err);
			}
			if (upload) yield { type: "upload", uploadId: upload.id, code: upload.code, team: upload.team };
			const uploadReadsBefore = upload ? await getUploadReads(conversationId) : 0;
			// Ghost CSA is only offered when there is actually a bundle to send.
			const hasBundle = upload
				? (
						await db
							.select({ id: teamUploadFiles.id })
							.from(teamUploadFiles)
							.where(
								and(
									eq(teamUploadFiles.upload_id, upload.id),
									eq(teamUploadFiles.kind, "support-bundle"),
								),
							)
							.limit(1)
							.execute()
					).length > 0
				: false;

			const gen = streamAnswer({
				history: prior,
				message: userText,
				docs,
				signal,
				repo: repo ?? undefined,
				repoReadsBefore,
				upload: upload ?? undefined,
				uploadReadsBefore,
				ghostCsaOffered: hasBundle && ghostCsaEnabled(),
				sendToGhostCsa: upload ? () => sendUploadToGhostCsa(upload!.id, ctx.user.id) : undefined,
				// The tool loop makes several API calls; bill each one as it finishes.
				onUsage: async (usage) => {
					await recordSpend(conversationId, usage).catch((err) =>
						console.error("[troubleshoot chat] recordSpend failed", err),
					);
				},
			});
			let result: Awaited<ReturnType<typeof gen.return>>["value"] | undefined;
			try {
				let next = await gen.next();
				while (!next.done) {
					yield next.value;
					next = await gen.next();
				}
				result = next.value;
			} catch (err) {
				console.error("[troubleshoot chat] stream failed", err);
				const msg =
					err instanceof Anthropic.RateLimitError
						? "The assistant is busy right now. Try again in a minute, or find a CSA."
						: err instanceof Anthropic.APIError
							? "The assistant could not answer right now. Find a CSA for help."
							: "Something went wrong.";
				yield { type: "error", message: msg };
				return;
			}

			const [saved] = await db
				.insert(troubleshootMessages)
				.values({
					conversation_id: conversationId,
					role: "assistant",
					text: result.text,
					cited_chunk_ids: result.citedChunkIds,
					question: result.question,
				})
				.returning({ id: troubleshootMessages.id });
			// Spend was already recorded per API call by onUsage.
			if (repo) await addRepoReads(conversationId, result.repoReads);
			if (upload) await addUploadReads(conversationId, result.uploadReads);

			yield { type: "done", conversationId, messageId: saved.id };
		}),
});
