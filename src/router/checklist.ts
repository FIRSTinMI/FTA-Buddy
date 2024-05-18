import { z } from "zod";
import { EventChecklist } from "../../shared/types";
import { eventProcedure, router } from "../trpc";
import { db } from "../db/db";
import { events } from "../db/schema";
import { eq } from "drizzle-orm";
import { getEvent } from "../util/get-event";

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

        (await getEvent(ctx.event.token)).checklistEmitter.emit('update', checklist);

        return checklist;
    })
});