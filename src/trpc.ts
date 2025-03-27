import { TRPCError, initTRPC } from '@trpc/server';
import { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import { and, eq, gt } from 'drizzle-orm';
import SuperJSON from 'superjson';
import { db } from './db/db';
import { events, users } from './db/schema';

export const createContext = (opts: CreateHTTPContextOptions | CreateWSSContextFnOptions) => ({
    token: opts.req.headers.authorization?.split(' ')[1],
    eventToken: (opts.req.headers['Event-Token'] || opts.req.headers['event-token'])?.toString(),
    extensionId: (opts.req.headers['Extension-Id']?.toString() || opts.req.headers['extension-id']?.toString()) || undefined,
    userAgent: opts.req.headers['User-Agent']?.toString(),
    ip: opts.req.headers['X-Forwarded-For']?.toString() || opts.req.connection.remoteAddress
});

type Context = Awaited<ReturnType<typeof createContext>>;
const t = initTRPC.context<Context>().create({
    transformer: SuperJSON
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async (opts) => {
    const { ctx } = opts;
    if (!ctx.token) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing Authorization Header' });

    const user = await db.query.users.findFirst({
        where: and(
            eq(users.token, ctx.token),
            gt(users.id, -1)

        )
    });
    if (!user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

    return opts.next({
        ctx: {
            ...ctx,
            user
        }
    });
});

export const eventProcedure = t.procedure.use(async (opts) => {
    const { ctx } = opts;
    if (!ctx.eventToken) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing Event Token Header' });

    const event = await db.query.events.findFirst({ where: eq(events.token, ctx.eventToken) });
    if (!event) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

    return opts.next({
        ctx: {
            ...ctx,
            event
        }
    });
});

export const adminProcedure = t.procedure.use(async (opts) => {
    const { ctx } = opts;
    if (!ctx.token) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

    const user = await db.query.users.findFirst({
        where: and(
            eq(users.token, ctx.token),
            gt(users.id, -1)
        )
    });
    if (!user || user.admin !== true) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

    return opts.next({
        ctx: {
            ...ctx,
            user
        }
    });
});
