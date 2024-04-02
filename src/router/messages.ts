import { z } from "zod";
import { eventProcedure, protectedProcedure, router } from "../trpc";
import { db } from "../db/db";
import { events, messages } from "../db/schema";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const messagesRouter = router({
    getTickets: eventProcedure.query(async ({ ctx }) => {
        const tickets = await db.query.messages.findMany({
            where: (eq(messages.is_ticket, true) && eq(messages.event_code, ctx.event.code) && eq(messages.thread_id, 0)),
            orderBy: desc(messages.created_at),
        });

        return tickets;
    }),

    createTicket: protectedProcedure.input(z.object({
        eventToken: z.string(),
        team: z.string(),
        message: z.string()
    })).query(async ({ ctx, input }) => {
        const event = await db.query.events.findFirst({
            where: eq(events.token, input.eventToken)
        });

        if (!event) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const insert = await db.insert(messages).values({
            message: input.message,
            user_id: ctx.user.id,
            team: input.team,
            event_code: event.code,
            thread_id: 0,
            is_ticket: true,
            is_open: true,
        }).returning();

        return insert[0];
    }),

    getMessages: protectedProcedure.input(z.object({
        ticketId: z.number()
    })).query(async ({ ctx, input }) => {
        const msgs = await db.query.messages.findMany({
            where: (eq(messages.id, input.ticketId) || eq(messages.thread_id, input.ticketId)),
            orderBy: desc(messages.created_at),
        });

        return messages;
    }),

    addMessage: protectedProcedure.input(z.object({
        ticketId: z.number().default(0),
        team: z.string().optional(),
        message: z.string()
    })).query(async ({ ctx, input }) => {
        const ticket = await db.query.messages.findFirst({
            where: eq(messages.id, input.ticketId)
        });

        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }

        const insert = await db.insert(messages).values({
            message: input.message,
            user_id: ctx.user.id,
            team: ticket.team,
            event_code: ticket.event_code,
            thread_id: ticket.thread_id,
            is_ticket: false,
            is_open: true,
        }).returning();

        return insert[0];
    }),
});
