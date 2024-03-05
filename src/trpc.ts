import { TRPCError, initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { db } from './db/db';
import { eq } from 'drizzle-orm';
import { events, users } from './db/schema';

export const createContext = ({ req, res }: trpcExpress.CreateExpressContextOptions) => ({
    token: req.headers.authorization?.split(' ')[1],
    eventToken: req.headers['Event-Token']?.toString(),
});
type Context = Awaited<ReturnType<typeof createContext>>;
const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async (opts) => {
    const { ctx } = opts;
    if (!ctx.token) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

    const user = await db.query.users.findFirst({ where: eq(users.token, ctx.token) });
    if (!user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

    return opts.next({
        ctx: {
            ...ctx,
            user
        }
    })
});

export const eventProcedure = t.procedure.use(async (opts) => {
    const { ctx } = opts;
    if (!ctx.eventToken) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

    const event = await db.query.events.findFirst({ where: eq(events.token, ctx.eventToken) });
    if (!event) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

    return opts.next({
        ctx: {
            ...ctx,
            event
        }
    })
});

export const adminProcedure = t.procedure.use(async (opts) => {
    const { ctx } = opts;
    if (!ctx.token) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

    const user = await db.query.users.findFirst({ where: eq(users.token, ctx.token) });
    if (!user || user.role !== "ADMIN") throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

    return opts.next({
        ctx: {
            ...ctx,
            user
        }
    })
});
