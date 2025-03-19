import { z } from "zod";
import { EventChecklist } from "../../shared/types";
import { eventProcedure, publicProcedure, router } from "../trpc";
import { db } from "../db/db";
import { events } from "../db/schema";
import { eq } from "drizzle-orm";
import { getEvent } from "../util/get-event";
import { observable } from "@trpc/server/observable";

export const checklistRouter = router({
    get: eventProcedure.query(async ({ input, ctx }) => {
        return ctx.event.checklist as EventChecklist;
    }),

    update: eventProcedure.input(z.array(z.object({
        team: z.string(),
        key: z.enum(['present', 'weighed', 'inspected', 'radioProgrammed', 'connectionTested']),
        value: z.boolean()
    }))).query(async ({ input, ctx }) => {
        const checklist = ctx.event.checklist as EventChecklist;
        for (const i of input) {
            checklist[i.team][i.key] = i.value;
        }

        await db.update(events).set({ checklist }).where(eq(events.code, ctx.event.code));

        const event = await getEvent(ctx.event.token);
        event.checklist = checklist;
        event.checklistEmitter.emit('update', checklist);

        let extensionId = ctx.extensionId;
        if (extensionId) {
            let connection = event.stats.extensions.find(e => e.id === extensionId);
            if (!connection) {
                connection = {
                    id: extensionId,
                    connected: new Date(),
                    userAgent: ctx.userAgent,
                    ip: ctx.ip,
                    lastFrame: new Date(),
                    frames: 0,
                    checklistUpdates: 0,
                };
                event.stats.extensions.push(connection);
            }

            connection.checklistUpdates += input.length;
        }

        return checklist;
    }),

    subscription: publicProcedure.input(z.object({
        eventToken: z.string()
    })).subscription(async ({ input }) => {
        const event = await getEvent(input.eventToken);

        return observable<EventChecklist>((emitter) => {
            const listener = (checklist: EventChecklist) => {
                emitter.next(checklist);
            };

            event.checklistEmitter.on('update', listener);

            return () => {
                event.checklistEmitter.off('update', listener);
            };
        });
    })
});
