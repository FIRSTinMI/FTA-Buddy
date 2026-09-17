import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import { slackSessionTokens } from "../db/schema";
import { adminProcedure, router } from "../trpc";
import { listSessionConversations, slackWebApi } from "../util/slack-session";
import { runSlackPollPass } from "../util/troubleshoot/slack-poller";

// Managing a browser-session Slack source (xoxc token + d cookie) for a workspace that blocks app
// installs. Admin only. The token and cookie are secrets; never returned to the client.
export const slackSessionRouter = router({
	list: adminProcedure.query(async () => {
		const rows = await db.select().from(slackSessionTokens);
		return rows.map((r) => ({
			id: r.id,
			teamName: r.team_name,
			teamDomain: r.team_domain,
			channels: r.channels,
			lastPolledAt: r.last_polled_at,
		}));
	}),

	set: adminProcedure
		.input(
			z.object({
				teamDomain: z
					.string()
					.min(1)
					.regex(/^[a-z0-9-]+$/, "Just the subdomain, e.g. myworkspace"),
				token: z.string().startsWith("xoxc-"),
				cookieD: z.string().min(20),
				channels: z.array(z.string()).default([]),
			}),
		)
		.mutation(async ({ input }) => {
			const session = { teamDomain: input.teamDomain, token: input.token, cookieD: input.cookieD };
			// Verify the credentials before storing them.
			let auth: { team_id: string; team?: string; url?: string };
			try {
				auth = await slackWebApi<{ team_id: string; team?: string; url?: string }>(session, "auth.test");
			} catch (err) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Slack rejected the token: ${(err as Error).message}`,
				});
			}
			const existing = await db
				.select()
				.from(slackSessionTokens)
				.where(eq(slackSessionTokens.team_id, auth.team_id));
			const values = {
				team_id: auth.team_id,
				team_name: auth.team ?? input.teamDomain,
				team_domain: input.teamDomain,
				token: input.token,
				cookie_d: input.cookieD,
				channels: input.channels,
				updated_at: new Date(),
			};
			if (existing[0]) {
				await db.update(slackSessionTokens).set(values).where(eq(slackSessionTokens.id, existing[0].id));
				return { id: existing[0].id, teamName: values.team_name };
			}
			const [ins] = await db.insert(slackSessionTokens).values(values).returning({ id: slackSessionTokens.id });
			return { id: ins.id, teamName: values.team_name };
		}),

	listChannels: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
		const [row] = await db.select().from(slackSessionTokens).where(eq(slackSessionTokens.id, input.id));
		if (!row) throw new TRPCError({ code: "NOT_FOUND" });
		const channels = await listSessionConversations({
			teamDomain: row.team_domain,
			token: row.token,
			cookieD: row.cookie_d,
		});
		return channels.map((c) => ({ id: c.id, name: c.name, isMember: c.is_member !== false }));
	}),

	setChannels: adminProcedure
		.input(z.object({ id: z.number(), channels: z.array(z.string()) }))
		.mutation(async ({ input }) => {
			await db
				.update(slackSessionTokens)
				.set({ channels: input.channels, updated_at: new Date() })
				.where(eq(slackSessionTokens.id, input.id));
			return { ok: true };
		}),

	remove: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
		await db.delete(slackSessionTokens).where(eq(slackSessionTokens.id, input.id));
		return { ok: true };
	}),

	pollNow: adminProcedure.mutation(async () => {
		const stats = await runSlackPollPass();
		return stats;
	}),
});
