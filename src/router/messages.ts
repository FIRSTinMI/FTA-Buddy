import { z } from "zod";
import { eventProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { db } from "../db/db";
import { matchLogs, messages, pushSubscriptions, users } from "../db/schema";
import { desc, eq, inArray, or, and, aliasedTable, not } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { Message, Profile, TeamList, Ticket, TicketMessage } from "../../shared/types";
import { getEvent } from "../util/get-event";
import { observable } from "@trpc/server/observable";
import { sendNotification } from "../util/push-notifications";

export interface TicketPost {
    type: "create" | "message" | "ticketReply" | "assign" | "status";
    data: Ticket | TicketMessage | Message;
}

export const messagesRouter = router({
    getTickets: eventProcedure.input(z.object({
        limit: z.number().default(20),
        page: z.number().default(1)
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(ctx.event.token);

        if (event.tickets) return event.tickets;

        return (await getTickets({ eventCode: ctx.event.code })).sort((a, b) => {
            let aTime = a.created_at.getTime();
            let bTime = b.created_at.getTime();
            if (a.messages.length > 0) aTime = a.messages[a.messages.length - 1].created_at.getTime();
            if (b.messages.length > 0) bTime = b.messages[b.messages.length - 1].created_at.getTime();
            return aTime - bTime;
        });
    }),


    createTicket: protectedProcedure.input(z.object({
        eventToken: z.string(),
        team: z.number(),
        summary: z.string(),
        message: z.string(),
        matchID: z.string().nullable().optional(),
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

        sendNotification(event.users.filter(u => (u !== ctx.user.id)), {
            title: `New Ticket: Team ${input.team}`,
            body: input.summary,
            tag: 'Ticket Created',
            data: {
                page: 'ticket/' + insert[0].id,
            }
        });

        return insert[0];
    }),

    getTicket: protectedProcedure.input(z.object({
        id: z.number()
    })).query(async ({ ctx, input }) => {
        const ticket = (await db.select({
            id: messages.id,
            user_id: messages.user_id,
            team: messages.team,
            is_ticket: messages.is_ticket,
            thread_id: messages.thread_id,
            created_at: messages.created_at,
            summary: messages.summary,
            assigned_to: messages.assigned_to,
            event_code: messages.event_code,
            match_id: messages.match_id,
            is_open: messages.is_open,
            message: messages.message,
            closed_at: messages.closed_at,
            user: {
                id: users.id,
                username: users.username,
                role: users.role,
            }
        })
            .from(messages)
            .leftJoin(users, eq(messages.user_id, users.id))
            .where(eq(messages.id, input.id)))[0];

        const ticketMessages = await db.select({
            id: messages.id,
            user_id: messages.user_id,
            team: messages.team,
            is_ticket: messages.is_ticket,
            thread_id: messages.thread_id,
            created_at: messages.created_at,
            summary: messages.summary,
            assigned_to: messages.assigned_to,
            event_code: messages.event_code,
            match_id: messages.match_id,
            is_open: messages.is_open,
            message: messages.message,
            closed_at: messages.closed_at,
            user: {
                id: users.id,
                username: users.username,
                role: users.role,
            }
        })
            .from(messages)
            .leftJoin(users, eq(messages.user_id, users.id))
            .where(eq(messages.thread_id, input.id));


        return { ...ticket, messages: ticketMessages };
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

        const usersWhoSentMessages = await db.select({
            id: messages.user_id,
        })
            .from(messages)
            .where(and(
                eq(messages.thread_id, input.id),
                not(eq(messages.user_id, ctx.user.id))
            ));

        // Remove duplicate watchers
        const watchers = Array.from(new Set(usersWhoSentMessages.map(watcher => watcher.id)));

        sendNotification(watchers, {
            title: `Ticket #${ticket.id} ${input.status ? "Reopened" : "Closed"}`,
            body: `Team ${ticket.team}`,
            tag: 'Ticket Update',
            data: {
                page: 'ticket/' + ticket.id,
            }
        });

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

        if (input.user !== ctx.user.id) {
            sendNotification(assignees, {
                title: `Ticket #${ticket.id} Assigned to you`,
                body: `You have been assigned to ticket #${ticket.id} for team ${ticket.team}`,
                tag: 'Ticket Update',
                data: {
                    page: 'ticket/' + ticket.id,
                }
            });
        }

        return profiles;
    }),

    addMessage: protectedProcedure.input(z.object({
        ticketId: z.number().default(0),
        team: z.number().or(z.string()),
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

        const usersWhoSentMessages = await db.select({
            id: messages.user_id,
        })
            .from(messages)
            .where(and(
                eq(messages.thread_id, input.ticketId),
                not(eq(messages.user_id, ctx.user.id))
            ));

        // Remove duplicate watchers
        const watchers = Array.from(new Set(usersWhoSentMessages.map(watcher => watcher.id)));

        sendNotification(watchers, {
            title: `Ticket #${ticket.id}`,
            body: input.message,
            tag: 'Ticket Reply',
            data: {
                page: 'ticket/' + ticket.id,
            }
        });

        return insert[0];
    }),

    getMessagesAndTickets: protectedProcedure.input(z.object({
        team: z.number().optional(),
        limit: z.number().default(40),
        page: z.number().default(1)
    })).query(async ({ ctx, input }) => {
        const ticketsAndMessages = [...await getTickets({ team: input.team?.toString() }), ...await getMessages(input.team?.toString() ?? "0")].sort((a, b) => {
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
                if (msg.team == input.team.toString()) {
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

export async function getTickets(options: { team?: string, eventCode?: string; }) {
    const ticketsSelect = db.select({
        id: messages.id,
        user_id: messages.user_id,
        team: messages.team,
        is_ticket: messages.is_ticket,
        thread_id: messages.thread_id,
        created_at: messages.created_at,
        summary: messages.summary,
        assigned_to: messages.assigned_to,
        event_code: messages.event_code,
        match_id: messages.match_id,
        is_open: messages.is_open,
        message: messages.message,
        closed_at: messages.closed_at,
        user: {
            id: users.id,
            username: users.username,
            role: users.role,
        },
    }).from(messages)
        .leftJoin(users, eq(messages.user_id, users.id))
        .orderBy(desc(messages.created_at));

    if (options.team) {
        ticketsSelect.where(and(eq(messages.team, options.team), eq(messages.is_ticket, true)));
    } else if (options.eventCode) {
        ticketsSelect.where(and(eq(messages.event_code, options.eventCode), eq(messages.is_ticket, true)));
    }

    const tickets = await ticketsSelect.execute();

    let processedTickets: Ticket[] = tickets.map(ticket => ({
        ...ticket,
        summary: ticket.summary ?? "",
        messages: [],
        user: ticket.user ?? { id: 0, username: "Unknown", role: "FTA" },
        assigned_to: (ticket.assigned_to as Profile[]) ?? [],
        is_ticket: true,
    }));

    if (tickets.length > 0) {
        const ticketIds = processedTickets.map(ticket => ticket.id);
        const ticketMessages = await db.select({
            id: messages.id,
            user_id: messages.user_id,
            team: messages.team,
            is_ticket: messages.is_ticket,
            thread_id: messages.thread_id,
            created_at: messages.created_at,
            summary: messages.summary,
            assigned_to: messages.assigned_to,
            event_code: messages.event_code,
            match_id: messages.match_id,
            is_open: messages.is_open,
            message: messages.message,
            closed_at: messages.closed_at,
            user: {
                id: users.id,
                username: users.username,
                role: users.role,
            }
        })
            .from(messages)
            .leftJoin(users, eq(messages.user_id, users.id))
            .where(inArray(messages.thread_id, ticketIds))
            .orderBy(desc(messages.created_at))
            .execute();

        processedTickets = processedTickets.map(ticket => {
            return {
                ...ticket,
                messages: ticketMessages
                    .filter(msg => msg.thread_id === ticket.id)
                    .map(msg => ({
                        ...msg,
                        is_ticket: false,
                        user: msg.user ?? { id: 0, username: "Unknown", role: "FTA" }
                    })),
            };
        });
    }

    return processedTickets;
}

export async function getMessages(team: string) {
    const msgs = await db.select({
        id: messages.id,
        user_id: messages.user_id,
        team: messages.team,
        is_ticket: messages.is_ticket,
        thread_id: messages.thread_id,
        created_at: messages.created_at,
        summary: messages.summary,
        assigned_to: messages.assigned_to,
        event_code: messages.event_code,
        match_id: messages.match_id,
        is_open: messages.is_open,
        message: messages.message,
        closed_at: messages.closed_at,
        user: {
            id: users.id,
            username: users.username,
            role: users.role,
        }
    }).from(messages)
        .where(and(
            eq(messages.team, team),
            eq(messages.thread_id, 0),
            eq(messages.is_ticket, false)
        ))
        .leftJoin(users, eq(messages.user_id, users.id))
        .orderBy(desc(messages.created_at))
        .execute();

    return msgs.map(msg => ({
        ...msg,
        user: msg.user ?? { id: 0, username: "Unknown", role: "FTA" },
        is_ticket: false,
    }));
}
