import { TRPCError } from "@trpc/server";
import Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import { troubleshootChunks, troubleshootConversations, troubleshootMessages } from "../db/schema";
import { adminProcedure, protectedProcedure, router } from "../trpc";
import { streamAnswer } from "../util/troubleshoot/chat/answer";
import { assertChatEnabled, isChatEnabled, setChatEnabled } from "../util/troubleshoot/chat/enabled";
import { retrieveChunks } from "../util/troubleshoot/chat/retrieve";
import { searchEventTickets } from "../util/troubleshoot/chat/event-tickets";
import { SOURCE_LABELS, type ChatCitation, type ChatEvent } from "../util/troubleshoot/chat/types";
import { assertRateLimit } from "../util/troubleshoot/rate-limit";
import { assertBudget, getSpendStatus, recordSpend, TROUBLESHOOT_MODEL } from "../util/troubleshoot/spend";
import { PLANNER_MODEL } from "../util/troubleshoot/pricing";

export type { ChatCitation, ChatEvent } from "../util/troubleshoot/chat/types";
export { SOURCE_LABELS };

/** A conversation is closed to new turns after this many user messages. */
const MAX_USER_TURNS = 8;
const MAX_MESSAGE_CHARS = 800;
const RETRIEVE_LIMIT = 6;

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
		.input(z.object({ limit: z.number().int().min(1).max(50).default(20) }).optional())
		.query(async ({ ctx, input }) => {
			const convs = await db
				.select({
					id: troubleshootConversations.id,
					created_at: troubleshootConversations.created_at,
					updated_at: troubleshootConversations.updated_at,
				})
				.from(troubleshootConversations)
				.where(eq(troubleshootConversations.user_id, ctx.user.id))
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

			const gen = streamAnswer({ history: prior, message: userText, docs, signal });
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
				})
				.returning({ id: troubleshootMessages.id });
			await recordSpend(conversationId, result.usage).catch((err) =>
				console.error("[troubleshoot chat] recordSpend failed", err),
			);

			yield { type: "done", conversationId, messageId: saved.id };
		}),
});
