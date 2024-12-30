import { z } from "zod";
import { adminProcedure, eventProcedure, protectedProcedure, router } from "../trpc";
import { db } from "../db/db";
import { tickets, messages, users} from "../db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { Message } from "../../shared/types";
import { getEvent } from "../util/get-event";
import { sendNotification } from "../util/push-notifications";
import { randomUUID } from "crypto";

export interface MessagePost {
    type: "create";
    data: Message;
}

export const messagesRouter = router({

    loadAllForEvent: adminProcedure.input(z.object({
        event_code: z.string(),
    })).query(async ({ctx, input}) => {
        const eventMessages = await db.query.messages.findMany({
            where:eq(messages.event_code, input.event_code),
        });
        
        return eventMessages;    
    }),

    getAllOnTicket: eventProcedure.input(z.object({
        ticket_id: z.string().uuid(),
        author_id: z.number(),
        event_code: z.string(),
    })).query(async ({ctx, input}) => {
        const ticket = await db.query.tickets.findFirst({
            where: and(
                eq(tickets.id, input.ticket_id),
                eq(tickets.event_code, input.event_code),
            )
        });
        
        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }

        const messageIds = ticket.messages as string[];

        const messagesOnTicket = await db.query.messages.findMany({
            where: inArray(messages.id, messageIds),
        });

        if (!messagesOnTicket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No Messages found on this Ticket" });
        }

        return messagesOnTicket.sort((a, b) => {
            let aTime = a.created_at.getTime();
            let bTime = b.created_at.getTime();
            return aTime - bTime;
        });    
    }),

    getById: eventProcedure.input(z.object({
        id: z.string().uuid(),
    })).query(async ({ ctx, input }) => {
        const message = await db.query.messages.findFirst({
            where: eq(messages.id, input.id),
        });
        
        if (!message) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
        }

        return message;
    }),

    create: protectedProcedure.input(z.object({
        ticket_id: z.string().uuid(),
        team: z.number(),
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

        const authorProfile = await db.query.users.findFirst({
            where: eq(users.id, ctx.user.id)
        });

        if (!authorProfile) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve author Profile" });
        }

        const insert = await db.insert(messages).values({
            id: randomUUID(),
            ticket_id: ticket.id,
            author_id: authorProfile.id,
            author: {
                id: authorProfile.id,
                username: authorProfile.username,
                role: authorProfile.role,
            },
            text: input.text,
            event_code: ticket.event_code,
            created_at: new Date(),
            updated_at: new Date(),
        }).returning();

        if (!insert) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create Message on this Ticket" });
        }

        event.messageEmitter.emit('create', { 
            ...insert[0], ticket_id: ticket.id, user: { 
                username: ctx.user.username, id: ctx.user.id, role: ctx.user.role 
            } 
        });

        const followers = ticket.followers as number[];

        sendNotification(followers, {
            title: `New Message on Ticket "${ticket.subject}": Team ${input.team}`,
            body: input.text,
            tag: 'New Message on Ticket',
            data: {
                page: 'ticket/' + ticket.id,
            }
        });

        return insert[0];
    }),

    editText: protectedProcedure.input(z.object({
        message_id: z.string().uuid(),
        new_text: z.string(),
    })).query(async ({ ctx, input }) => {
        const message = await db.query.messages.findFirst({
            where: eq(messages.id, input.message_id),
        });
        
        if (!message) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
        }

        const update = await db.update(messages).set({
            text: input.new_text
        }).where(eq(messages.id, input.message_id)).returning();

        if (!update) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update Message text" });
        }

        return update;
    }),

    delete: protectedProcedure.input(z.object({
        message_id: z.string().uuid(),
    })).query(async ({ ctx, input }) => {
        const message = await db.query.messages.findFirst({
            where: eq(messages.id, input.message_id),
        });
        
        if (!message) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
        }

        const result = await db.delete(messages).where(eq(messages.id, input.message_id));

        if (!result) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to delete Message" });
        }

        return result;
    }),
});