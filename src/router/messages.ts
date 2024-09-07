import { z } from "zod";
import { eventProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { db } from "../db/db";
import { matchLogs, messages, pushSubscriptions, users } from "../db/schema";
import { desc, eq, inArray, or, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { Message, Profile, TeamList, Ticket, TicketMessage } from "../../shared/types";
import { getEvent } from "../util/get-event";
import { observable } from "@trpc/server/observable";
import { sendNotification } from "../util/push-notifiactions";

export interface TicketPost {
    type: "create" | "message" | "ticketReply" | "assign" | "status";
    data: Ticket | TicketMessage | Message;
}

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
                user: profiles.find(p => p.id === msg.user_id),
                is_ticket: false
            });
        }

        let processedTickets: Ticket[] = [];

        for (let ticket of tickets) {
            let ticketMessages = msgsWithProfiles.filter(msg => msg.thread_id === ticket.id);
            const assigned_to: Profile[] = [];

            for (let user of (ticket.assigned_to as number[])) {
                const profile = profiles.find(p => p.id === user);
                if (profile) assigned_to.push(profile);
            }

            processedTickets.push({
                ...ticket,
                team: parseInt(ticket.team),
                user: profiles.find(p => p.id === ticket.user_id),
                summary: ticket.summary ?? "",
                assigned_to,
                teamName: (ctx.event.teams as TeamList).find(t => t.number == ticket.team)?.name,
                messages: ticketMessages,
                is_ticket: true
            });
        }

        processedTickets = processedTickets.sort((a, b) => {
            let aTime = a.created_at.getTime();
            let bTime = b.created_at.getTime();
            if (a.messages.length > 0) aTime = a.messages[a.messages.length - 1].created_at.getTime();
            if (b.messages.length > 0) bTime = b.messages[b.messages.length - 1].created_at.getTime();
            return aTime - bTime;
        });

        return processedTickets;
    }),

    createTicket: protectedProcedure.input(z.object({
        eventToken: z.string(),
        team: z.number(),
        summary: z.string(),
        message: z.string(),
        matchID: z.string().optional(),
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(input.eventToken);

        if (!event) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const insert = await db.insert(messages).values({
            summary: input.summary,
            message: input.message,
            user_id: ctx.user.id,
            team: input.team.toString(),
            event_code: event.code,
            thread_id: 0,
            is_ticket: true,
            is_open: true,
            match_id: input.matchID ?? null,
        }).returning();

        event.ticketEmitter.emit('create', { ...insert[0], user: { username: ctx.user.username, id: ctx.user.id, role: ctx.user.role } });

        sendNotification(event.users, {
            title: `New Ticket: ${input.team} ${input.summary}`,
            body: input.message,
            icon: "https://ftabuddy.com/app/assignment.png",
        })

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

        const msgsWithProfiles: TicketMessage[] = [];

        for (let msg of msgs) {
            msgsWithProfiles.push({
                ...msg,
                user: profiles.find(p => p.id === msg.user_id),
                is_ticket: false
            });
        }

        return {
            id: ticket.id,
            team: parseInt(ticket.team),
            summary: ticket.summary,
            created_at: ticket.created_at,
            user_id: ticket.user_id,
            event_code: ticket.event_code,
            is_open: ticket.is_open,
            assigned_to: (ticket.assigned_to as number[]).map(id => profiles.find(p => p.id === id)),
            closed_at: ticket.closed_at,
            is_ticket: true,
            match_id: ticket.match_id,
            message: ticket.message,
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
            messages: msgsWithProfiles
        } as Ticket;
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

        (await getEvent("", ticket.event_code)).ticketEmitter.emit('status', update[0]);

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

        if (assignees.length === 0) {
            (await getEvent("", ticket.event_code)).ticketEmitter.emit('assign', { ...update[0], assigned_to: [] });
            return [];
        }

        const profiles = await db.select({
            id: users.id,
            username: users.username,
            role: users.role,
        }).from(users).where(inArray(users.id, assignees));

        (await getEvent("", ticket.event_code)).ticketEmitter.emit('assign', { ...update[0], assigned_to: profiles });

        return profiles;
    }),

    addMessage: protectedProcedure.input(z.object({
        ticketId: z.number().default(0),
        team: z.number(),
        message: z.string(),
        eventToken: z.string()
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(input.eventToken);

        if (!event) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        if (input.ticketId === 0) {
            const insert = await db.insert(messages).values({
                message: input.message,
                user_id: ctx.user.id,
                team: input.team.toString(),
                event_code: event.code,
                thread_id: 0,
                is_ticket: false,
                is_open: false,
            }).returning();

            event.ticketEmitter.emit('message', insert[0]);

            return insert[0];
        }

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
            thread_id: ticket.id,
            is_ticket: false,
            is_open: false,
        }).returning();

        event.ticketEmitter.emit('ticketReply', { ...insert[0], user: { username: ctx.user.username, id: ctx.user.id, role: ctx.user.role } });

        return insert[0];
    }),

    getMessagesAndTickets: protectedProcedure.input(z.object({
        team: z.number().optional(),
        limit: z.number().default(40),
        page: z.number().default(1)
    })).query(async ({ ctx, input }) => {
        const tickets = await db.select().from(messages)
            .where(and(
                eq(messages.team, input.team?.toString() ?? "0"),
                eq(messages.is_ticket, true)))
            .orderBy(desc(messages.created_at))
            .limit(input.limit)
            .offset((input.page - 1) * input.limit);

        const ticketMsgs = await db.select().from(messages)
            .where(and(
                eq(messages.is_ticket, false),
                inArray(messages.thread_id, tickets.map(t => t.id))))
            .orderBy(desc(messages.created_at));

        const msgs = await db.select().from(messages)
            .where(and(
                eq(messages.team, input.team?.toString() ?? "0"),
                eq(messages.thread_id, 0),
                eq(messages.is_ticket, false)
            ))
            .orderBy(desc(messages.created_at))
            .limit(input.limit)
            .offset((input.page - 1) * input.limit);

        const profiles = await db.select({
            id: users.id,
            username: users.username,
            role: users.role,
        }).from(users).where(inArray(users.id, [...new Set([
            ...msgs.map(m => m.user_id),
            ...ticketMsgs.map(m => m.user_id),
            ...tickets.map(t => t.user_id)
        ])]));

        const msgsWithProfiles: Message[] = [];

        for (let msg of msgs) {
            msgsWithProfiles.push({
                ...msg,
                user: profiles.find(p => p.id === msg.user_id),
                is_ticket: false
            });
        }

        let processedTickets: Ticket[] = [];

        for (let ticket of tickets) {
            let ticketMessages = msgsWithProfiles.filter(msg => msg.thread_id === ticket.id);
            const assigned_to: Profile[] = [];

            for (let user of (ticket.assigned_to as number[])) {
                const profile = profiles.find(p => p.id === user);
                if (profile) assigned_to.push(profile);
            }

            processedTickets.push({
                ...ticket,
                team: parseInt(ticket.team),
                user: profiles.find(p => p.id === ticket.user_id),
                summary: ticket.summary ?? "",
                assigned_to,
                is_ticket: true,
                messages: ticketMessages
            });
        }

        const ticketsAndMessages = [...processedTickets, ...msgsWithProfiles].sort((a, b) => {
            let aTime = a.created_at.getTime();
            let bTime = b.created_at.getTime();
            // if (a.is_ticket) aTime = a.messages[a.messages.length - 1].created_at.getTime();
            // if (b.is_ticket) bTime = b.messages[b.messages.length - 1].created_at.getTime();
            return aTime - bTime;
        });

        return ticketsAndMessages;
    }),

    backgroundSubscription: publicProcedure.input(z.object({
        eventToken: z.string()
    })).subscription(async ({ input }) => {
        const event = await getEvent(input.eventToken);

        return observable<TicketPost>((emitter) => {
            const listener = (type: "message" | "ticketReply" | "create", msg: Ticket | TicketMessage | Message) => {
                emitter.next({
                    type,
                    data: msg
                });
            };

            event.ticketEmitter.on('message', (msg) => listener("message", msg));
            event.ticketEmitter.on('ticketReply', (msg) => listener("ticketReply", msg));
            event.ticketEmitter.on('create', (msg) => listener("create", msg));

            return () => {
                event.ticketEmitter.off('message', (msg) => listener("message", msg));
                event.ticketEmitter.off('ticketReply', (msg) => listener("ticketReply", msg));
                event.ticketEmitter.off('create', (msg) => listener("create", msg));
            };
        });
    }),

    foregroundSubscription: publicProcedure.input(z.object({
        eventToken: z.string()
    })).subscription(async ({ input }) => {
        const event = await getEvent(input.eventToken);

        return observable<TicketPost>((emitter) => {
            const listener = (type: "assign" | "status" | "create" | "ticketReply", msg: Ticket | TicketMessage | Message) => {
                emitter.next({
                    type,
                    data: msg
                });
            };

            event.ticketEmitter.on('assign', (msg) => listener("assign", msg));
            event.ticketEmitter.on('status', (msg) => listener("status", msg));
            event.ticketEmitter.on('create', (msg) => listener("create", msg));
            event.ticketEmitter.on('ticketReply', (msg) => listener("ticketReply", msg));

            return () => {
                event.ticketEmitter.off('assign', (msg) => listener("assign", msg));
                event.ticketEmitter.off('status', (msg) => listener("status", msg));
                event.ticketEmitter.off('create', (msg) => listener("create", msg));
                event.ticketEmitter.off('ticketReply', (msg) => listener("ticketReply", msg));
            };
        });
    }),

    ticketSubscription: publicProcedure.input(z.object({
        id: z.number(),
        eventToken: z.string()
    })).subscription(async ({ input }) => {
        const authEvent = await getEvent(input.eventToken);

        if (!authEvent) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const ticket = await db.query.messages.findFirst({
            where: eq(messages.id, input.id)
        });

        let event;
        if (authEvent.code !== ticket?.event_code) {
            event = await getEvent("", ticket?.event_code ?? '');
        } else {
            event = authEvent;
        }

        return observable<TicketPost>((emitter) => {
            const listener = (type: "assign" | "status" | "ticketReply", msg: Ticket | TicketMessage) => {
                if ((msg.is_ticket && msg.id === input.id) || (!msg.is_ticket && msg.thread_id === input.id)) {
                    emitter.next({
                        type,
                        data: msg
                    });
                }
            };

            event.ticketEmitter.on('assign', (msg) => listener("assign", msg));
            event.ticketEmitter.on('status', (msg) => listener("status", msg));
            event.ticketEmitter.on('ticketReply', (msg) => listener("ticketReply", msg));

            return () => {
                event.ticketEmitter.off('assign', (msg) => listener("assign", msg));
                event.ticketEmitter.off('status', (msg) => listener("status", msg));
                event.ticketEmitter.off('ticketReply', (msg) => listener("ticketReply", msg));
            };
        });
    }),

    teamSubscription: publicProcedure.input(z.object({
        team: z.number(),
        eventToken: z.string()
    })).subscription(async ({ input }) => {
        const event = await getEvent(input.eventToken);

        return observable<TicketPost>((emitter) => {
            const listener = (type: "assign" | "status" | "ticketReply" | "create" | "message", msg: Ticket | TicketMessage | Message) => {
                if (msg.team == input.team) {
                    emitter.next({
                        type,
                        data: msg
                    });
                }
            };

            event.ticketEmitter.on('assign', (msg) => listener("assign", msg));
            event.ticketEmitter.on('status', (msg) => listener("status", msg));
            event.ticketEmitter.on('ticketReply', (msg) => listener("ticketReply", msg));
            event.ticketEmitter.on('create', (msg) => listener("create", msg));
            event.ticketEmitter.on('message', (msg) => listener("message", msg));

            return () => {
                event.ticketEmitter.off('assign', (msg) => listener("assign", msg));
                event.ticketEmitter.off('status', (msg) => listener("status", msg));
                event.ticketEmitter.off('ticketReply', (msg) => listener("ticketReply", msg));
                event.ticketEmitter.off('create', (msg) => listener("create", msg));
                event.ticketEmitter.off('message', (msg) => listener("message", msg));
            };
        });
    }),

    registerPush: protectedProcedure.input(z.object({
        endpoint: z.string(),
        expirationTime: z.date(),
        keys: z.object({
            p256dh: z.string(),
            auth: z.string()
        })
    })).query(async ({ input, ctx }) => {
        db.insert(pushSubscriptions).values({
            endpoint: input.endpoint,
            expirationTime: input.expirationTime,
            keys: input.keys,
            user_id: ctx.user.id
        }).execute();

        return true;
    }),

});
