import { TRPCError, initTRPC } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { eq } from "drizzle-orm";
import SuperJSON from "superjson";
import { db } from "./db/db";
import { users } from "./db/schema";
import { verifyIdToken } from "./util/firebase-admin";
import { getEvent } from "./util/get-event";

/**
 * Verify a Firebase ID token and resolve the matching user profile row.
 *
 * Matches first by `firebase_uid`, then falls back to email (and backfills the
 * uid) so users imported/created before their uid was linked still resolve on
 * first authenticated request. Returns null when the token is invalid or no
 * profile exists yet (the latter happens before account setup completes).
 */
export async function resolveUserFromToken(idToken: string | undefined) {
	if (!idToken) return null;
	const decoded = await verifyIdToken(idToken);
	if (!decoded) return null;

	let user = await db.query.users.findFirst({ where: eq(users.firebase_uid, decoded.uid) });

	if (!user && decoded.email) {
		const byEmail = await db.query.users.findFirst({ where: eq(users.email, decoded.email) });
		if (byEmail) {
			await db.update(users).set({ firebase_uid: decoded.uid }).where(eq(users.id, byEmail.id));
			user = { ...byEmail, firebase_uid: decoded.uid };
		}
	}

	return user ?? null;
}

export const createContext = (opts: CreateExpressContextOptions) => {
	const h = opts.req.headers;
	const q = opts.req.query as Record<string, string | undefined>;

	// Headers first, then fall back to query-params (needed for SSE / EventSource
	// which cannot send custom headers).
	const token = typeof h.authorization === "string" ? h.authorization.split(" ")[1] : q.token;
	const eventToken = (h["event-token"] ?? h["Event-Token"])?.toString() ?? q.eventToken;
	const extensionId = (h["extension-id"] ?? h["Extension-Id"])?.toString();
	const userAgent = (h["user-agent"] ?? h["User-Agent"])?.toString();
	const ip = (h["x-forwarded-for"] ?? h["X-Forwarded-For"])?.toString() ?? opts.req.socket.remoteAddress;

	return {
		token,
		eventToken,
		extensionId,
		userAgent,
		ip,
	};
};

type Context = Awaited<ReturnType<typeof createContext>>;
const t = initTRPC.context<Context>().create({
	transformer: SuperJSON,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async (opts) => {
	const { ctx } = opts;
	if (!ctx.token) throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing Authorization Header" });

	const user = await resolveUserFromToken(ctx.token);
	if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });

	return opts.next({
		ctx: {
			...ctx,
			user,
		},
	});
});

export const eventProcedure = t.procedure.use(async (opts) => {
	const { ctx } = opts;
	let user = null;

	if (!ctx.eventToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing Event Token Header" });
	const event = await getEvent(ctx.eventToken);

	if (ctx.token) user = await resolveUserFromToken(ctx.token);

	return opts.next({
		ctx: {
			...ctx,
			event,
			user,
		},
	});
});

export const adminProcedure = t.procedure.use(async (opts) => {
	const { ctx } = opts;
	if (!ctx.token) throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });

	const user = await resolveUserFromToken(ctx.token);
	if (!user || user.admin !== true) throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });

	return opts.next({
		ctx: {
			...ctx,
			user,
		},
	});
});
