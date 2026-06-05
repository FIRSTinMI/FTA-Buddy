import { TRPCError } from "@trpc/server";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import { events, slackLinkTokens, users } from "../db/schema";
import { protectedProcedure, publicProcedure, resolveUserFromToken, router } from "../trpc";
import { verifyIdToken } from "../util/firebase-admin";

const ROLES = ["FTA", "FTAA", "CSA", "RI"] as const;

/** Fields safe to return to the client (never the deprecated password/token columns). */
function publicProfile(user: typeof users.$inferSelect) {
	return {
		id: user.id,
		username: user.username,
		email: user.email,
		role: user.role,
		admin: user.admin,
		slack_user_id: user.slack_user_id,
		active_event_code: user.active_event_code,
	};
}

export const userRouter = router({
	/**
	 * Called after a successful Firebase sign-in. Ensures a profile row exists
	 * for the authenticated user and returns it. Authentication is the Firebase
	 * ID token in the Authorization header (ctx.token).
	 *
	 * On first sign-in there is no profile yet: if username/role are supplied the
	 * row is created, otherwise `{ needsProfile: true }` is returned so the client
	 * can collect them (the "finish creating account" screen).
	 */
	syncProfile: publicProcedure
		.input(
			z.object({
				username: z.string().min(3, "Username must be at least 3 characters long").optional(),
				role: z.enum(ROLES).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.token) throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing Authorization Header" });

			const decoded = await verifyIdToken(ctx.token);
			if (!decoded || !decoded.email)
				throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired session" });

			const existing = await resolveUserFromToken(ctx.token);
			if (existing) {
				await db.update(users).set({ last_seen: new Date() }).where(eq(users.id, existing.id));
				return { user: publicProfile(existing) };
			}

			// No profile yet - need a username + role to create one.
			if (!input.username || !input.role) {
				return { needsProfile: true as const, email: decoded.email };
			}

			await db.insert(users).values({
				email: decoded.email,
				firebase_uid: decoded.uid,
				username: input.username,
				role: input.role,
			});

			const created = await db.query.users.findFirst({ where: eq(users.firebase_uid, decoded.uid) });
			if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "User not created" });

			return { user: publicProfile(created) };
		}),

	checkAuth: publicProcedure
		.input(
			z.object({
				token: z.string().optional(),
				eventToken: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const idToken = input.token ?? ctx.token;
			if (!idToken && !input.eventToken) throw new Error("No token provided");

			const returnObj: {
				user?: ReturnType<typeof publicProfile>;
				event?: typeof events.$inferSelect;
			} = {};

			if (idToken) {
				const user = await resolveUserFromToken(idToken);
				if (user) {
					await db.update(users).set({ last_seen: new Date() }).where(eq(users.id, user.id));
					returnObj.user = publicProfile(user);
				}
			}

			if (input.eventToken) {
				returnObj.event = await db.query.events.findFirst({ where: eq(events.token, input.eventToken) });
			}

			return returnObj;
		}),

	changeRole: protectedProcedure
		.input(
			z.object({
				newRole: z.enum(ROLES),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await db.update(users).set({ role: input.newRole }).where(eq(users.id, ctx.user.id));
			return { newRole: input.newRole };
		}),

	linkSlackAccount: protectedProcedure
		.input(
			z.object({
				slackUserId: z.string().regex(/^[UW][A-Z0-9]{6,}$/, "Invalid Slack member ID format"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await db.update(users).set({ slack_user_id: input.slackUserId }).where(eq(users.id, ctx.user.id));
			return true;
		}),

	unlinkSlackAccount: protectedProcedure.mutation(async ({ ctx }) => {
		await db.update(users).set({ slack_user_id: null }).where(eq(users.id, ctx.user.id));
		return true;
	}),

	redeemSlackLinkToken: protectedProcedure.input(z.object({ token: z.string() })).mutation(async ({ ctx, input }) => {
		const row = await db.query.slackLinkTokens.findFirst({
			where: and(eq(slackLinkTokens.token, input.token), gt(slackLinkTokens.expires_at, new Date())),
		});

		if (!row) {
			throw new TRPCError({ code: "NOT_FOUND", message: "Link token not found or expired" });
		}

		await db.update(users).set({ slack_user_id: row.slack_user_id }).where(eq(users.id, ctx.user.id));
		await db.delete(slackLinkTokens).where(eq(slackLinkTokens.token, input.token));

		return { slackUserId: row.slack_user_id };
	}),
});

/**
 * Generate a random opaque token. Still used for event tokens and Slack link
 * tokens (NOT user auth, which now uses Firebase ID tokens).
 */
export function generateToken() {
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
