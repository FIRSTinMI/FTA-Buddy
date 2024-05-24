import { z } from "zod";
import { eventProcedure, protectedProcedure, router } from "../trpc";
import { db } from "../db/db";
import { events, matchLogs, messages, users } from "../db/schema";
import { desc, eq, inArray, or, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { TeamList, TicketMessage } from "../../shared/types";

export const messagesRouter = router({
    getTickets: eventProcedure.input(z.object({
        limit: z.number().default(20),
        page: z.number().default(1)
    })).query(async ({ ctx, input }) => {
        const tickets = await db.select().from(messages)
            .where(and(eq(messages.is_ticket, true), eq(messages.event_code, ctx.event.code)))
            .orderBy(desc(messages.created_at))
            .limit(input.limit)
            .offset((input.page - 1) * input.limit);

        const msgs = await db.select().from(messages)
            .where(and(
                eq(messages.is_ticket, false),
                eq(messages.event_code, ctx.event.code),
                inArray(messages.thread_id, tickets.map(t => t.id))))
            .orderBy(desc(messages.created_at));

        const profiles = await db.select({
            id: users.id,
            username: users.username,
            role: users.role,
        }).from(users).where(inArray(users.id, [...new Set([...tickets.map(t => t.user_id), ...msgs.map(m => m.user_id)])]));
        // Copilot generated this beautiful oneliner and I love it

        const msgsWithProfiles: TicketMessage[] = [];

        for (let msg of msgs) {
            msgsWithProfiles.push({
                ...msg,
                user: profiles.find(p => p.id === msg.user_id)
            });
        }

        let returnTickets = [];

        for (let ticket of tickets) {
            let ticketMessages = msgsWithProfiles.filter(msg => msg.thread_id === ticket.id);

            returnTickets.push({
                ...ticket,
                user: profiles.find(p => p.id === ticket.user_id),
                assigned_to: (ticket.assigned_to as number[]).map(id => profiles.find(p => p.id === id)),
                teamName: (ctx.event.teams as TeamList).find(t => t.number == ticket.team)?.name,
                messages: ticketMessages
            });
        }

        return returnTickets;
    }),

    createTicket: protectedProcedure.input(z.object({
        eventToken: z.string(),
        team: z.number(),
        message: z.string(),
        matchID: z.string().optional(),
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
            team: input.team.toString(),
            event_code: event.code,
            thread_id: 0,
            is_ticket: true,
            is_open: true,
            match_id: input.matchID ?? null,
        }).returning();

        return insert[0];
    }),

    getTicket: protectedProcedure.input(z.object({
        id: z.number()
    })).query(async ({ ctx, input }) => {
        const msgs = await db.query.messages.findMany({
            where: or(eq(messages.id, input.id), eq(messages.thread_id, input.id)),
            orderBy: desc(messages.created_at),
        });

        const ticket = msgs.find(msg => msg.is_ticket);

        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }

        const profileFilters = [eq(users.id, ticket.user_id)];

        if ((ticket.assigned_to as number[]).length > 0) {
            profileFilters.push(inArray(users.id, ticket.assigned_to as number[]));
        }

        if (msgs.length > 1) {
            profileFilters.push(inArray(users.id, msgs.map(msg => msg.user_id)));
        }

        const profiles = await db.select({
            id: users.id,
            username: users.username,
            role: users.role,
        }).from(users).where(or(...profileFilters));

        return {
            id: ticket.id,
            team: ticket.team,
            created_at: ticket.created_at,
            user_id: ticket.user_id,
            event_code: ticket.event_code,
            is_open: ticket.is_open,
            assigned_to: (ticket.assigned_to as number[]).map(id => profiles.find(p => p.id === id)),
            closed_at: ticket.closed_at,
            match_id: ticket.match_id,
            match: ticket.match_id ? (await db.select({
                id: matchLogs.id,
                match_number: matchLogs.match_number,
                play_number: matchLogs.play_number,
                level: matchLogs.level,
                stations: {
                    blue1: matchLogs.blue1,
                    blue2: matchLogs.blue2,
                    blue3: matchLogs.blue3,
                    red1: matchLogs.red1,
                    red2: matchLogs.red2,
                    red3: matchLogs.red3,
                }
            }).from(matchLogs).where(eq(matchLogs.id, ticket.match_id)))[0] : null,
            messages: msgs
        };
    }),

    updateTicketStatus: protectedProcedure.input(z.object({
        id: z.number(),
        status: z.boolean()
    })).query(async ({ ctx, input }) => {
        const ticket = await db.query.messages.findFirst({
            where: eq(messages.id, input.id)
        });

        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }

        const update = await db.update(messages).set({
            is_open: input.status,
            closed_at: input.status ? new Date() : null
        }).where(eq(messages.id, input.id)).returning();

        return update[0];
    }),

    assignTicket: protectedProcedure.input(z.object({
        id: z.number(),
        user: z.number(),
        assign: z.boolean()
    })).query(async ({ ctx, input }) => {
        const ticket = await db.query.messages.findFirst({
            where: eq(messages.id, input.id)
        });

        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }

        const assignees = ticket.assigned_to as number[];

        if (input.assign && !(assignees).includes(input.user)) {
            assignees.push(input.user);
        } else if (!input.assign && (assignees).includes(input.user)) {
            assignees.splice(assignees.indexOf(input.user), 1);
        }

        const update = await db.update(messages).set({
            assigned_to: assignees
        }).where(eq(messages.id, input.id)).returning();

        if (assignees.length === 0) return [];

        const profiles = await db.select({
            id: users.id,
            username: users.username,
            role: users.role,
        }).from(users).where(inArray(users.id, assignees));

        return profiles;
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
