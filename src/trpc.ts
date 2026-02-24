import { TRPCError, initTRPC } from "@trpc/server";
import { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { and, eq, gt } from "drizzle-orm";
import SuperJSON from "superjson";
import { db } from "./db/db";
import { events, users } from "./db/schema";

export const createContext = (opts: CreateHTTPContextOptions | CreateWSSContextFnOptions) => {
	const h = opts.req.headers;

	const token = typeof h.authorization === "string" ? h.authorization.split(" ")[1] : undefined;
	const eventToken = (h["event-token"] ?? h["Event-Token"])?.toString(); // keep both if you want
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

	const user = await db.query.users.findFirst({
		where: and(eq(users.token, ctx.token), gt(users.id, -1)),
	});
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
	if (!ctx.eventToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing Event Token Header" });

	const event = await db.query.events.findFirst({ where: eq(events.token, ctx.eventToken) });
	if (!event) throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });

	return opts.next({
		ctx: {
			...ctx,
			event,
		},
	});
});

export const adminProcedure = t.procedure.use(async (opts) => {
	const { ctx } = opts;
	if (!ctx.token) throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });

	const user = await db.query.users.findFirst({
		where: and(eq(users.token, ctx.token), gt(users.id, -1)),
	});
	if (!user || user.admin !== true) throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });

	return opts.next({
		ctx: {
			...ctx,
			user,
		},
	});
});
