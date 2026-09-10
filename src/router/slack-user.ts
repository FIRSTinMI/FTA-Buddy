import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import { slackUserTokens } from "../db/schema";
import { adminProcedure, protectedProcedure, router } from "../trpc";
import { createInstallUrl, isAuthError, listConversations } from "../util/slack-user-oauth";
import { runSlackPollPass } from "../util/troubleshoot/slack-poller";
import { TRPCError } from "@trpc/server";

async function ownedToken(userId: number, tokenId: number) {
	const row = await db.query.slackUserTokens.findFirst({
		where: and(eq(slackUserTokens.id, tokenId), eq(slackUserTokens.user_id, userId)),
	});
	if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Slack connection not found" });
	return row;
}

export const slackUserRouter = router({
	/** Slack authorize URL with a one-time state bound to the caller. Open it in a new tab. */
	getInstallUrl: protectedProcedure.mutation(async ({ ctx }) => {
		return { url: await createInstallUrl(ctx.user.id) };
	}),

	list: protectedProcedure.query(async ({ ctx }) => {
		const rows = await db
			.select({
				id: slackUserTokens.id,
				team_id: slackUserTokens.team_id,
				team_name: slackUserTokens.team_name,
				slack_user_id: slackUserTokens.slack_user_id,
				scopes: slackUserTokens.scopes,
				channels: slackUserTokens.channels,
				last_polled_at: slackUserTokens.last_polled_at,
				created_at: slackUserTokens.created_at,
			})
			.from(slackUserTokens)
			.where(eq(slackUserTokens.user_id, ctx.user.id))
			.orderBy(slackUserTokens.team_name);
		return rows.map((r) => ({ ...r, revoked: r.scopes === "revoked" }));
	}),

	listChannels: protectedProcedure.input(z.object({ tokenId: z.number().int() })).query(async ({ ctx, input }) => {
		const row = await ownedToken(ctx.user.id, input.tokenId);
		if (row.scopes === "revoked")
			throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Reconnect this workspace first" });
		try {
			const channels = await listConversations(row.access_token);
			return channels
				.map((c) => ({
					id: c.id,
					name: c.name,
					is_private: !!c.is_private,
					num_members: c.num_members ?? null,
				}))
				.sort((a, b) => a.name.localeCompare(b.name));
		} catch (err) {
			if (isAuthError(err)) {
				await db
					.update(slackUserTokens)
					.set({ scopes: "revoked", updated_at: new Date() })
					.where(eq(slackUserTokens.id, row.id));
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Slack revoked this token. Reconnect the workspace.",
				});
			}
			throw new TRPCError({ code: "BAD_GATEWAY", message: (err as Error).message });
		}
	}),

	setChannels: protectedProcedure
		.input(
			z.object({ tokenId: z.number().int(), channelIds: z.array(z.string().regex(/^[CG][A-Z0-9]+$/)).max(500) }),
		)
		.mutation(async ({ ctx, input }) => {
			const row = await ownedToken(ctx.user.id, input.tokenId);
			const channels = [...new Set(input.channelIds)];
			await db
				.update(slackUserTokens)
				.set({ channels, updated_at: new Date() })
				.where(eq(slackUserTokens.id, row.id));
			return { channels };
		}),

	disconnect: protectedProcedure.input(z.object({ tokenId: z.number().int() })).mutation(async ({ ctx, input }) => {
		const row = await ownedToken(ctx.user.id, input.tokenId);
		await db.delete(slackUserTokens).where(eq(slackUserTokens.id, row.id));
		return { ok: true };
	}),

	/** Kick off a poll pass now on this instance. Returns when the pass finishes. */
	pollNow: adminProcedure.mutation(async () => {
		return runSlackPollPass();
	}),
});
