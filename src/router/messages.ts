import { z } from "zod";
import { adminProcedure, eventProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { db } from "../db/db";
import { tickets, messages, users } from "../db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { Message, Profile } from "../../shared/types";
import { getEvent } from "../util/get-event";
import { randomUUID } from "crypto";
import { createNotification } from "../util/push-notifications";

export const messagesRouter = router({

    loadAllForEvent: adminProcedure.input(z.object({
        event_code: z.string(),
    })).query(async ({ input }) => {
        const eventMessages = await db.query.messages.findMany({
            where: eq(messages.event_code, input.event_code),
            orderBy: [asc(messages.created_at)],

        });

        return eventMessages as Message[];
    }),

    getById: eventProcedure.input(z.object({
        id: z.string().uuid(),
    })).query(async ({ input }) => {
        const message = await db.query.messages.findFirst({
            where: eq(messages.id, input.id),
        });

        if (!message) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
        }

        return message as Message;
    }),

    create: eventProcedure.input(z.object({
        ticket_id: z.number(),
        text: z.string(),
        event_code: z.string(),
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(ctx.eventToken as string);

        const ticket = await db.query.tickets.findFirst({
            where: and(
                eq(tickets.id, input.ticket_id),
                eq(tickets.event_code, input.event_code),
            )
        });

        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }

        const authorProfile = await db.select({
            id: users.id,
            username: users.username,
            role: users.role,
            admin: users.admin,
        }).from(users).where(eq(users.token, ctx.token as string)) as Profile[];

        if (!authorProfile[0]) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve author Profile" });
        }

        const insert = await db.insert(messages).values({
            id: randomUUID(),
            ticket_id: ticket.id,
            author_id: authorProfile[0].id,
            author: authorProfile[0],
            text: input.text,
            event_code: ticket.event_code,
            created_at: new Date(),
            updated_at: new Date(),
        }).returning();

        await db.update(tickets).set({
            updated_at: new Date()
        }).where(eq(tickets.id, ticket.id));

        if (!insert[0]) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create Message on this Ticket" });
        }

        event.ticketUpdateEmitter.emit("add_message", {
            kind: "add_message",
            ticket_id: ticket.id,
            message: insert[0] as Message,
        });

        createNotification(ticket.followers, {
            id: randomUUID(),
            timestamp: new Date(),
            topic: "New-Ticket-Message",
            title: `New Message Added to Ticket #${ticket.id}`,
            body: `A new message has been added to Ticket #${ticket.id} by ${authorProfile[0].username}`,
            data: {
                page: "ticket/" + ticket.id,
                ticket_id: ticket.id,
            },
        });

        return insert[0] as Message;
    }),

    edit: eventProcedure.input(z.object({
        ticket_id: z.number(),
        message_id: z.string().uuid(),
        new_text: z.string(),
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(ctx.eventToken as string);

        const ticket = await db.query.tickets.findFirst({
            where: and(
                eq(tickets.id, input.ticket_id),
                eq(tickets.event_code, event.code),
            )
        });

        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }

        const message = await db.query.messages.findFirst({
            where: eq(messages.id, input.message_id),
        });

        if (!message) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
        }

        let currentUserProfile: Profile[] | undefined;

        if (ctx.token) {
            currentUserProfile = await db.select({
                id: users.id,
                username: users.username,
                role: users.role,
                admin: users.admin,
            }).from(users).where(eq(users.token, ctx.token));
        } else {
            throw new TRPCError({ code: "BAD_REQUEST", message: "User token not provided in context object" });
        }

        if (!currentUserProfile[0]) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Current User not found by provided token" });
        }

        const update = await db.update(messages).set({
            text: input.new_text,
            updated_at: new Date()
        }).where(eq(messages.id, input.message_id)).returning();

        await db.update(tickets).set({
            updated_at: new Date()
        }).where(eq(tickets.id, ticket.id));

        if (!update[0]) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update Message text" });
        }

        event.ticketUpdateEmitter.emit("edit_message", {
            kind: "edit_message",
            ticket_id: ticket.id,
            message: update[0] as Message,
        });

        return update[0] as Message;
    }),

    delete: eventProcedure.input(z.object({
        ticket_id: z.number(),
        message_id: z.string().uuid(),
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(ctx.eventToken as string);

        const message = await db.query.messages.findFirst({
            where: eq(messages.id, input.message_id),
        });

        if (!message) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
        }

        let currentUserProfile: Profile[] | undefined;

        if (ctx.token) {
            currentUserProfile = await db.select({
                id: users.id,
                username: users.username,
                role: users.role,
                admin: users.admin,
            }).from(users).where(eq(users.token, ctx.token));
        } else {
            throw new TRPCError({ code: "BAD_REQUEST", message: "User token not provided in context object" });
        }

        if (!currentUserProfile[0]) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Current User not found by provided token" });
        }

        const result = await db.delete(messages).where(eq(messages.id, input.message_id));

        if (!result) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to delete Message" });
        }

        event.ticketUpdateEmitter.emit("delete_message", {
            kind: "delete_message",
            ticket_id: message.ticket_id,
            message_id: message.id,
        });

        return message.id;
    }),
});

export async function getEventMessages(event_code: string) {
    const eventMessages = await db.query.messages.findMany({
        where: eq(messages.event_code, event_code),
        orderBy: [asc(messages.created_at)],
    });

    if (!eventMessages) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Unable to find Messages for this event" });
    }

    return eventMessages;
}