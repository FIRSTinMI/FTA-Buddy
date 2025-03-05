import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { randomUUID } from "crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { notificationEmitter } from "..";
import { formatTimeShortNoAgoMinutes } from "../../shared/formatTime";
import type { Notification } from "../../shared/types";
import { NotificationEvents, Profile, Ticket, TicketUpdateEventData, TicketUpdateEvents } from "../../shared/types";
import { db } from "../db/db";
import { messages, pushSubscriptions, tickets, users } from "../db/schema";
import { eventProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { getEvent } from "../util/get-event";
import { createNotification } from "../util/push-notifications";
import { generateReport } from "../util/report-generator";
import { messagesRouter } from "./messages";
import { addSlackReaction, removeSlackReaction, sendMessageToEventChannel, sendSlackMessage } from "../util/slack";

const messageRouter = messagesRouter;

export type TeamTicketsInfo = {
    team: number,
    totalOpenTime: number,
    avgOpenTime: number | null,
    tickets: Ticket[],
    ticketSubjects: string,
    ticketLinks: string,
    longestTicketOpenTime: number,
    longestTicket: Ticket | null,
};

export const ticketsRouter = router({

    getAllWithMessages: eventProcedure.query(async ({ ctx }) => {
        const event = await getEvent(ctx.eventToken as string);

        let eventCodes = [event.code];

        if (event.meshedEvent && event.subEvents) {
            eventCodes = eventCodes.concat(event.subEvents.map((subEvent) => subEvent.code));
        }

        const eventTickets = await db.query.tickets.findMany({
            where: inArray(tickets.event_code, eventCodes),
            orderBy: [asc(tickets.created_at)],
            with: {
                messages: {
                    orderBy: [asc(messages.id)],
                },
            }
        });

        if (!eventTickets) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Tickets not found" });
        }

        return eventTickets as Ticket[];
    }),

    getAllByWithMessages: eventProcedure.input(z.object({
        event_code: z.string(),
        author_id: z.number().optional(),
        team_number: z.number().optional(),
        assigned_to_id: z.number().optional(),
        is_open: z.boolean().optional(),
    })).query(async ({ ctx, input }) => {
        let query = [];

        if (input.event_code) {
            const event = await getEvent('', input.event_code);
            if (event.meshedEvent && event.subEvents) {
                query.push(inArray(tickets.event_code, [event.code, ...event.subEvents.map((subEvent) => subEvent.code)]));
            } else {
                query.push(eq(tickets.event_code, input.event_code));
            }
        }
        if (input.team_number) {
            query.push(eq(tickets.team, input.team_number));
        }
        if (input.author_id) {
            query.push(eq(tickets.author_id, input.author_id));
        }
        if (input.assigned_to_id) {
            query.push(eq(tickets.assigned_to_id, input.assigned_to_id));
        }
        if (input.is_open !== undefined) {
            query.push(eq(tickets.is_open, input.is_open));
        }

        const results = await db.query.tickets.findMany({
            where: and(...query),
            orderBy: [asc(tickets.created_at)],
            with: {
                messages: {
                    orderBy: [asc(messages.id)],
                },
            },
        });

        if (!results) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No Tickets found by provided criteria" });
        }

        return results as Ticket[];
    }),

    getByIdWithMessages: eventProcedure.input(z.object({
        id: z.number(),
        event_code: z.string(),
    })).query(async ({ ctx, input }) => {
        const event = await getEvent('', input.event_code);

        let eventCodes = [event.code];

        if (event.meshedEvent && event.subEvents) {
            eventCodes = eventCodes.concat(event.subEvents.map((subEvent) => subEvent.code));
        }

        const ticket = await db.query.tickets.findFirst({
            where: and(
                eq(tickets.id, input.id),
                inArray(tickets.event_code, eventCodes),
            ),
            with: {
                messages: {
                    orderBy: [asc(messages.id)],
                },
            }
        });

        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }

        return ticket as Ticket;
    }),

    publicCreate: publicProcedure.input(z.object({
        event_code: z.string(),
        team: z.number(),
        subject: z.string(),
        text: z.string(),
    })).query(async ({ input }) => {
        const event = await getEvent("", input.event_code);

        const author = await db.select({
            id: users.id,
            username: users.username,
            role: users.role,
            admin: users.admin,
        }).from(users).where(eq(users.id, -1));

        if (!author[0]) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve author Profile" });
        }

        if (!event.teams.find(teamInfo => parseInt(teamInfo.number) === input.team)) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Provided Team number is not associated with this Event" });
        }

        if (!event.publicTicketSubmit) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Public Ticket submission is disabled for this Event" });
        }

        const insert = await db.insert(tickets).values({
            team: input.team,
            subject: input.subject,
            author_id: author[0].id,
            author: author[0] as Profile, // Ensure author is not null
            assigned_to_id: null,
            assigned_to: null,
            is_open: true,
            text: input.text,
            created_at: new Date(),
            updated_at: new Date(),
            event_code: event.code,
            followers: [author[0].id],
            match_id: undefined,
            slack_channel: event.slackChannel
        }).returning();


        if (!insert[0]) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create Ticket" });
        }

        event.ticketUpdateEmitter.emit("create", {
            kind: "create",
            ticket_id: insert[0].id,
            ticket: insert[0] as Ticket,
        });

        createNotification(event.users.map((user) => user.id), {
            id: randomUUID(),
            timestamp: new Date(),
            topic: "Ticket-Created",
            title: `New Ticket for Team #${insert[0].team}`,
            body: `New Ticket created by Team #:${insert[0].team}`,
            data: {
                page: "ticket/" + insert[0].id,
                ticket_id: insert[0].id,
            },
        });

        if (event.slackChannel && event.slackTeam) {
            const buttons = [];
            buttons.push({
                "type": "button",
                "text": {
                    "type": "plain_text",
                    "text": "View Ticket",
                    "emoji": true
                },
                "url": `https://ftabuddy.com/app/ticket/${insert[0].id}`
            });
            if (insert[0].match_id) {
                buttons.push({
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "View Match Log",
                        "emoji": true
                    },
                    "url": `https://ftabuddy.com/app/logs/${insert[0].match_id}`
                });
            }

            let messageTS = await sendSlackMessage(event.slackChannel, event.slackTeam, {
                "blocks": [
                    {
                        "type": "header",
                        "text": {
                            "type": "plain_text",
                            "text": `New Ticket #${insert[0].id} For Team ${insert[0].team}`,
                            "emoji": true
                        }
                    },
                    {
                        "type": "context",
                        "elements": [
                            {
                                "type": "plain_text",
                                "text": `Created by: ${insert[0].author?.username}`,
                                "emoji": true
                            }
                        ]
                    },
                    {
                        "type": "rich_text",
                        "elements": [
                            {
                                "type": "rich_text_section",
                                "elements": [
                                    {
                                        "type": "text",
                                        "text": `${insert[0].subject}`,
                                        "style": {
                                            "bold": true
                                        }
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "rich_text",
                        "elements": [
                            {
                                "type": "rich_text_section",
                                "elements": [
                                    {
                                        "type": "text",
                                        "text": `${insert[0].text}`,
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "actions",
                        "elements": buttons
                    }
                ]
            });
            await db.update(tickets).set({ slack_ts: messageTS }).where(eq(tickets.id, insert[0].id)).execute();
        }

        return insert[0] as Ticket;
    }),

    create: eventProcedure.input(z.object({
        team: z.number(),
        subject: z.string(),
        text: z.string(),
        match_id: z.string().optional(),
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(ctx.eventToken as string);

        const author = await db.select({
            id: users.id,
            username: users.username,
            role: users.role,
            admin: users.admin,
        }).from(users).where(eq(users.token, ctx.token as string));

        if (!author[0]) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve author Profile" });
        }

        let insert;
        if (input.match_id) {
            insert = await db.insert(tickets).values({
                team: input.team,
                subject: input.subject,
                author_id: author[0].id,
                author: author[0] as Profile, // Ensure author is not null
                assigned_to_id: null,
                assigned_to: null,
                is_open: true,
                text: input.text,
                created_at: new Date(),
                updated_at: new Date(),
                event_code: event.code,
                followers: [author[0].id],
                match_id: input.match_id,
            }).returning();
        } else {
            insert = await db.insert(tickets).values({
                team: input.team,
                subject: input.subject,
                author_id: author[0].id,
                author: author[0] as Profile, // Ensure author is not null
                assigned_to_id: null,
                assigned_to: null,
                is_open: true,
                text: input.text,
                created_at: new Date(),
                updated_at: new Date(),
                event_code: event.code,
                followers: [author[0].id],
                match_id: undefined,
            }).returning();
        }


        if (!insert[0]) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create Ticket" });
        }

        event.ticketUpdateEmitter.emit("create", {
            kind: "create",
            ticket_id: insert[0].id,
            ticket: insert[0] as Ticket,
        });

        createNotification(event.users.map((user) => user.id), {
            id: randomUUID(),
            timestamp: new Date(),
            topic: "Ticket-Created",
            title: `New Ticket for Team #${insert[0].team}`,
            body: `New Ticket created by ${author[0].username}`,
            data: {
                page: "ticket/" + insert[0].id,
                ticket_id: insert[0].id,
            },
        });

        if (event.slackChannel && event.slackTeam) {
            const buttons = [];
            buttons.push({
                "type": "button",
                "text": {
                    "type": "plain_text",
                    "text": "View Ticket",
                    "emoji": true
                },
                "url": `https://ftabuddy.com/app/ticket/${insert[0].id}`
            });
            if (insert[0].match_id) {
                buttons.push({
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "View Match Log",
                        "emoji": true
                    },
                    "url": `https://ftabuddy.com/app/logs/${insert[0].match_id}`
                });
            }

            let messageTS = await sendSlackMessage(event.slackChannel, event.slackTeam, {
                "blocks": [
                    {
                        "type": "header",
                        "text": {
                            "type": "plain_text",
                            "text": `New Ticket #${insert[0].id} For Team ${insert[0].team}`,
                            "emoji": true
                        }
                    },
                    {
                        "type": "context",
                        "elements": [
                            {
                                "type": "plain_text",
                                "text": `Created by: ${insert[0].author?.username}`,
                                "emoji": true
                            }
                        ]
                    },
                    {
                        "type": "rich_text",
                        "elements": [
                            {
                                "type": "rich_text_section",
                                "elements": [
                                    {
                                        "type": "text",
                                        "text": `${insert[0].subject}`,
                                        "style": {
                                            "bold": true
                                        }
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "rich_text",
                        "elements": [
                            {
                                "type": "rich_text_section",
                                "elements": [
                                    {
                                        "type": "text",
                                        "text": `${insert[0].text}`,
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "actions",
                        "elements": buttons
                    }
                ]
            });
            await db.update(tickets).set({ slack_ts: messageTS }).where(eq(tickets.id, insert[0].id)).execute();
        }

        return insert[0] as Ticket;
    }),

    updateStatus: eventProcedure.input(z.object({
        id: z.number(),
        new_status: z.boolean(),
        event_code: z.string(),
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(ctx.eventToken as string);

        const ticket = await db.query.tickets.findFirst({
            where: and(
                eq(tickets.event_code, input.event_code),
                eq(tickets.id, input.id)
            )
        });

        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
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

        const update = await db.update(tickets).set({
            is_open: input.new_status,
            closed_at: !input.new_status ? new Date() : null,
            updated_at: new Date(),
        }).where(eq(tickets.id, input.id)).returning();

        event.ticketUpdateEmitter.emit("status", {
            kind: "status",
            ticket_id: update[0].id,
            is_open: update[0].is_open
        });

        createNotification(ticket.followers, {
            id: randomUUID(),
            timestamp: new Date(),
            topic: "Ticket-Status",
            title: `Ticket Status Updated to ${(update[0].is_open) ? "OPEN" : "CLOSED"}`,
            body: `Ticket status updated by ${currentUserProfile[0].username} and is now ${(update[0].is_open) ? "OPEN" : "CLOSED"}`,
            data: {
                page: "ticket/" + update[0].id,
                ticket_id: update[0].id,
            },
        });

        if (event.slackChannel && event.slackTeam && ticket.slack_ts) {
            if (update[0].is_open) {
                await addSlackReaction(event.slackChannel, event.slackTeam, ticket.slack_ts, "white_check_mark");
            } else {
                await removeSlackReaction(event.slackChannel, event.slackTeam, ticket.slack_ts, "white_check_mark");
            }
        }

        return update[0] as Ticket;
    }),

    assign: eventProcedure.input(z.object({
        id: z.number(),
        user_id: z.number(),
        event_code: z.string(),
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(ctx.eventToken as string);

        const ticket = await db.query.tickets.findFirst({
            where: and(
                eq(tickets.id, input.id),
                eq(tickets.event_code, input.event_code),
            )
        });

        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }

        const profile = await db.select({
            id: users.id,
            username: users.username,
            role: users.role,
            admin: users.admin,
        }).from(users).where(eq(users.id, input.user_id));

        if (!profile[0]) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve User profile" });
        }

        if (ticket.assigned_to_id === input.user_id) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "User is already assigned to this ticket" });
        }

        const update = await db.update(tickets).set({
            assigned_to_id: input.user_id,
            assigned_to: profile[0] as Profile,
            updated_at: new Date(),
        }).where(eq(tickets.id, input.id)).returning();


        if (!update[0]) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to assign User" });
        }

        event.ticketUpdateEmitter.emit("assign", {
            kind: "assign",
            ticket_id: update[0].id,
            assigned_to_id: update[0].assigned_to_id,
            assigned_to: profile[0] as Profile,
        });

        createNotification(ticket.followers.filter((id) => id !== profile[0].id), {
            id: randomUUID(),
            timestamp: new Date(),
            topic: "Ticket-Assigned",
            title: `Ticket #${ticket.id} Has Been Assigned`,
            body: `Ticket #${ticket.id} assigned to ${profile[0].username}`,
            data: {
                page: "ticket/" + ticket.id,
                ticket_id: ticket.id,
            },
        });

        createNotification([profile[0].id], {
            id: randomUUID(),
            timestamp: new Date(),
            topic: "Ticket-Assigned",
            title: `A Ticket Has Been Assigned to You`,
            body: `Ticket #${ticket.id} assigned to you`,
            data: {
                page: "ticket/" + ticket.id,
                ticket_id: ticket.id,
            },
        });

        return update[0] as Ticket;
    }),

    unAssign: eventProcedure.input(z.object({
        ticket_id: z.number(),
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

        if (ticket.assigned_to_id === -1) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "No user currently assigned to this ticket" });
        }

        let profile: Profile[] | null = [];

        if (ticket.assigned_to === null && ticket.assigned_to_id) {
            profile = await db.select({
                id: users.id,
                username: users.username,
                role: users.role,
                admin: users.admin,
            }).from(users).where(eq(users.id, ticket.assigned_to_id));
        } else if (ticket.assigned_to_id === null) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No user currently assigned to this Ticket" });
        } else if (ticket.assigned_to_id !== null && ticket.assigned_to !== null) {
            profile.push(ticket.assigned_to);
        }

        if (!profile[0]) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Unable to find User currently assigned to Ticket" });
        }

        const update = await db.update(tickets).set({
            assigned_to_id: null,
            assigned_to: null,
            updated_at: new Date(),
        }).where(eq(tickets.id, input.ticket_id)).returning();


        if (!update[0]) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update assignation status" });
        }

        event.ticketUpdateEmitter.emit("assign", {
            kind: "assign",
            ticket_id: update[0].id,
            assigned_to_id: update[0].assigned_to_id,
            assigned_to: null,
        });

        createNotification(ticket.followers, {
            id: randomUUID(),
            timestamp: new Date(),
            topic: "Ticket-Assigned",
            title: `Ticket #${ticket.id} Has Been Set to Unassigned`,
            body: `Ticket #${ticket.id} has been set to unassigned`,
            data: {
                page: "ticket/" + ticket.id,
                ticket_id: ticket.id,
            },
        });

        createNotification([profile[0].id], {
            id: randomUUID(),
            timestamp: new Date(),
            topic: "Ticket-Assigned",
            title: `No Longer Assigned to Ticket #${ticket.id}`,
            body: `You are no longer assigned to Ticket #${ticket.id}`,
            data: {
                page: "ticket/" + ticket.id,
                ticket_id: ticket.id,
            },
        });

        return update[0] as Ticket;
    }),

    edit: eventProcedure.input(z.object({
        id: z.number(),
        new_text: z.string().optional(),
        new_subject: z.string().optional(),
        event_code: z.string(),
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(ctx.eventToken as string);

        const ticket = await db.query.tickets.findFirst({
            where: and(
                eq(tickets.id, input.id),
                eq(tickets.event_code, input.event_code),
            )
        });

        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
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
            throw new TRPCError({ code: "NOT_FOUND", message: "Current User not found by token" });
        }

        const update = await db.update(tickets).set({
            text: input.new_text,
            subject: input.new_subject,
            updated_at: new Date()
        }).where(eq(tickets.id, input.id)).returning();

        if (!update[0]) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update Ticket text" });
        }

        event.ticketUpdateEmitter.emit("edit", {
            kind: "edit",
            ticket_id: update[0].id,
            ticket_subject: update[0].subject,
            ticket_text: update[0].text,
            ticket_updated_at: update[0].updated_at,
        });

        return update[0] as Ticket;
    }),

    follow: protectedProcedure.input(z.object({
        id: z.number(),
        follow: z.boolean(),
        event_code: z.string(),
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(ctx.eventToken as string);

        const ticket = await db.query.tickets.findFirst({
            where: and(
                eq(tickets.id, input.id),
                eq(tickets.event_code, input.event_code),
            )
        });

        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }

        let currentUserProfile: Profile[] | undefined;

        if (ctx.token) {
            currentUserProfile = await db.select({
                id: users.id,
                username: users.username,
                role: users.role,
                admin: users.admin,
            }).from(users).where(eq(users.token, ctx.token as string));
        } else {
            throw new TRPCError({ code: "BAD_REQUEST", message: "User token not provided in context object" });
        }

        if (!currentUserProfile[0]) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Current User not found by token" });
        }

        const followers = ticket.followers as number[];

        let updatedFollowers: number[] = [];
        let update: Ticket[] = [];

        if (!followers.includes(ctx.user.id) && input.follow === true) {

            followers.push(ctx.user.id);

            update = await db.update(tickets).set({
                followers: followers,
            }).where(eq(tickets.id, input.id)).returning() as Ticket[];

        } else if (!followers.includes(ctx.user.id) && input.follow === false) {

            throw new TRPCError({ code: "BAD_REQUEST", message: "Current User is not following provided Ticket" });

        } else if (followers.includes(ctx.user.id) && input.follow === true) {

            throw new TRPCError({ code: "BAD_REQUEST", message: "Current User is already following provided Ticket" });

        } else if (followers.includes(ctx.user.id) && input.follow === false) {

            updatedFollowers = followers.filter(() => !ctx.user.id);

            update = await db.update(tickets).set({
                followers: updatedFollowers,
            }).where(eq(tickets.id, input.id)).returning() as Ticket[];
        }

        if (!update || (Array.isArray(update) && update.length === 0)) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update Ticket followers" });
        }

        event.ticketUpdateEmitter.emit("follow", {
            kind: "follow",
            ticket_id: update[0].id,
            followers: update[0].followers,
        });

        return update[0] as Ticket;
    }),

    delete: eventProcedure.input(z.object({
        id: z.number(),
        event_code: z.string(),
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(ctx.eventToken as string);

        const ticket = await db.query.tickets.findFirst({
            where: and(
                eq(tickets.id, input.id),
                eq(tickets.event_code, input.event_code),
            )
        });

        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }

        let result = await db.delete(tickets).where(eq(tickets.id, input.id));

        if (!result) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to delete Ticket" });
        }

        event.ticketUpdateEmitter.emit("delete_ticket", {
            kind: "delete_ticket",
            ticket_id: ticket.id,
        });

        return ticket.id;
    }),

    messages: messageRouter,

    updateSubscription: publicProcedure.input(z.object({
        eventToken: z.string(),
        ticket_id: z.number().optional(),
        eventOptions: z.object({
            create: z.boolean().optional(),
            assign: z.boolean().optional(),
            status: z.boolean().optional(),
            follow: z.boolean().optional(),
            delete_ticket: z.boolean().optional(),
            edit: z.boolean().optional(),
            add_message: z.boolean().optional(),
            edit_message: z.boolean().optional(),
            delete_message: z.boolean().optional(),
        }).optional(),
    })).subscription(async ({ input }) => {
        const event = await getEvent(input.eventToken);

        return observable<TicketUpdateEventData>((emitter) => {
            const createHandler: TicketUpdateEvents["create"] = (data) => {
                if (data.kind === "create" && input.ticket_id) {
                    if (data.ticket.id === input.ticket_id) {
                        emitter.next(data);
                    }
                } else if (data.kind === "create") {
                    emitter.next(data);
                }
            };

            const assignHandler: TicketUpdateEvents["assign"] = (data) => {
                if (data.kind === "assign" && input.ticket_id) {
                    if (data.ticket_id === input.ticket_id) {
                        emitter.next(data);
                    }
                } else if (data.kind === "assign") {
                    emitter.next(data);
                }
            };

            const statusHandler: TicketUpdateEvents["status"] = (data) => {
                if (data.kind === "status" && input.ticket_id) {
                    if (data.ticket_id === input.ticket_id) {
                        emitter.next(data);
                    }
                } else if (data.kind === "status") {
                    emitter.next(data);
                }
            };

            const followHandler: TicketUpdateEvents["follow"] = (data) => {
                if (data.kind === "follow" && input.ticket_id) {
                    if (data.ticket_id === input.ticket_id) {
                        emitter.next(data);
                    }
                } else if (data.kind === "follow") {
                    emitter.next(data);
                }
            };

            const deleteTicketHandler: TicketUpdateEvents["delete_ticket"] = (data) => {
                if (data.kind === "delete_ticket" && input.ticket_id) {
                    if (data.ticket_id === input.ticket_id) {
                        emitter.next(data);
                    }
                } else if (data.kind === "delete_ticket") {
                    emitter.next(data);
                }
            };

            const editHandler: TicketUpdateEvents["edit"] = (data) => {
                if (data.kind === "edit" && input.ticket_id) {
                    if (data.ticket_id === input.ticket_id) {
                        emitter.next(data);
                    }
                } else if (data.kind === "edit") {
                    emitter.next(data);
                }
            };

            const addMessageHandler: TicketUpdateEvents["add_message"] = (data) => {
                //console.log(data);
                //console.log(input.ticket_id, data.message.ticket_id);
                if (data.kind === "add_message" && input.ticket_id) {
                    if (data.message.ticket_id === input.ticket_id) {
                        console.log("emitting");
                        emitter.next(data);
                    }
                } else if (data.kind === "add_message") {
                    emitter.next(data);
                }
            };

            const editMessageHandler: TicketUpdateEvents["edit_message"] = (data) => {
                if (data.kind === "edit_message" && input.ticket_id) {
                    if (data.message.ticket_id === input.ticket_id) {
                        emitter.next(data);
                    }
                } else if (data.kind === "edit_message") {
                    emitter.next(data);
                }
            };

            const deleteMessageHandler: TicketUpdateEvents["delete_message"] = (data) => {
                if (data.kind === "delete_message" && input.ticket_id) {
                    if (data.ticket_id === input.ticket_id) {
                        emitter.next(data);
                    }
                } else if (data.kind === "delete_message") {
                    emitter.next(data);
                }
            };

            if (!input.eventOptions) {
                input.eventOptions = {
                    create: true,
                    assign: true,
                    status: true,
                    follow: true,
                    delete_ticket: true,
                    edit: true,
                    add_message: true,
                    edit_message: true,
                    delete_message: true,
                };
            }

            if (input.eventOptions.create === true) {
                event.ticketUpdateEmitter.on("create", createHandler);
            }

            if (input.eventOptions.assign === true) {
                event.ticketUpdateEmitter.on("assign", assignHandler);
            }

            if (input.eventOptions.status === true) {
                event.ticketUpdateEmitter.on("status", statusHandler);
            }

            if (input.eventOptions.follow === true) {
                event.ticketUpdateEmitter.on("follow", followHandler);
            }

            if (input.eventOptions.delete_ticket === true) {
                event.ticketUpdateEmitter.on("delete_ticket", deleteTicketHandler);
            }

            if (input.eventOptions.edit === true) {
                event.ticketUpdateEmitter.on("edit", editHandler);
            }

            if (input.eventOptions.add_message === true) {
                event.ticketUpdateEmitter.on("add_message", addMessageHandler);
            }

            if (input.eventOptions.edit_message === true) {
                event.ticketUpdateEmitter.on("edit_message", editMessageHandler);
            }

            if (input.eventOptions.delete_message === true) {
                event.ticketUpdateEmitter.on("delete_message", deleteMessageHandler);
            }

            return () => {
                event.ticketUpdateEmitter.off("create", createHandler);
                event.ticketUpdateEmitter.off("assign", assignHandler);
                event.ticketUpdateEmitter.off("status", statusHandler);
                event.ticketUpdateEmitter.off("follow", followHandler);
                event.ticketUpdateEmitter.off("delete_ticket", deleteTicketHandler);
                event.ticketUpdateEmitter.off("edit", editHandler);
                event.ticketUpdateEmitter.off("add_message", addMessageHandler);
                event.ticketUpdateEmitter.off("edit_message", editMessageHandler);
                event.ticketUpdateEmitter.off("delete_message", deleteMessageHandler);
            };
        });
    }),

    pushSubscription: publicProcedure.input(z.object({
        token: z.string(),
    })).subscription(async ({ input }) => {
        const user = await db.query.users.findFirst({ where: eq(users.token, input.token) });

        if (!user) {
            throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }

        return observable<Notification>((emitter) => {

            const notificationHandler: NotificationEvents['send'] = (data) => {
                //console.log(data);
                if (data.users.includes(user.id)) {
                    emitter.next(data.notification);
                }
            };

            notificationEmitter.on("send", notificationHandler);

            return () => {
                notificationEmitter.off("send", notificationHandler);
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

    generateTicketReport: eventProcedure.query(async ({ ctx }) => {
        const event = await getEvent(ctx.eventToken as string);

        const totalAvgOpenTime = await getAllAvgOpenTime(event.code);

        const teamNumbers = event.teams.map((team) => parseInt(team.number));

        const allTeamsTicketInfo = await getAllTeamTicketsInfo(event.code, teamNumbers);

        const path = await generateReport({
            title: `Ticket Report for ${event.code}`,
            description: `Average Total Ticket Open Time: ${formatTimeShortNoAgoMinutes(totalAvgOpenTime)}`,
            headers: ['Team #', 'Total Open Time', '# of Tickets', 'Avg Open Time', 'Longest Open Time', 'Longest Subject', 'All Subjects', 'All Ticket Links'],
            fileName: 'TicketReport'
        }, allTeamsTicketInfo.map((teamInfo) => [
            teamInfo.team,
            formatTimeShortNoAgoMinutes(teamInfo.totalOpenTime) ?? "None",
            teamInfo.tickets.length,
            (teamInfo.avgOpenTime !== null ? formatTimeShortNoAgoMinutes(teamInfo.avgOpenTime) : "None") ?? "None",
            formatTimeShortNoAgoMinutes(teamInfo.longestTicketOpenTime) ?? "None",
            (teamInfo.longestTicket !== null) ? `#${teamInfo.longestTicket.id} - ${teamInfo.longestTicket.subject}` : "",
            teamInfo.ticketSubjects,
            teamInfo.ticketLinks ?? "None",
        ]), event.code);

        return { path };
    }),

    attachMatchLog: eventProcedure.input(z.object({
        matchId: z.string(),
        ticketId: z.number(),
    })).mutation(({ ctx, input }) => {
        return db.update(tickets).set({
            match_id: input.matchId,
        }).where(eq(tickets.id, input.ticketId)).returning();
    })
});

export async function getEventTickets(event_code: string) {
    const eventTickets = await db.query.tickets.findMany({
        where: eq(tickets.event_code, event_code),
        orderBy: [asc(tickets.created_at)],
        with: {
            messages: true,
        }
    });

    if (!eventTickets) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Unable to find tickets for this event" });
    }

    return eventTickets;
}

export function getTotalOpenTime(ticketArray: Ticket[]) {
    const totalOpenTime = ticketArray.reduce((totalDuration, ticket) => {
        if (ticket.created_at && ticket.closed_at) {
            const created_at = new Date(ticket.created_at).getTime();
            const closed_at = new Date(ticket.closed_at).getTime();
            return totalDuration + (closed_at - created_at);
        }
        return totalDuration;
    }, 0);

    return totalOpenTime;
}

export async function getAllAvgOpenTime(event_code: string) {
    const eventTickets = await db.query.tickets.findMany({
        where: eq(tickets.event_code, event_code),
        orderBy: [desc(tickets.created_at)],
    });

    if (!eventTickets) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Unable to find tickets for this event" });
    }

    if (eventTickets.length < 1) {
        return 0;
    }

    const totalOpenTime = eventTickets.reduce((totalDuration, ticket) => {
        if (ticket.created_at && ticket.closed_at) {
            const created_at = new Date(ticket.created_at).getTime();
            const closed_at = new Date(ticket.closed_at).getTime();
            return totalDuration + (closed_at - created_at);
        }
        return totalDuration;
    }, 0);

    const avgOpenTime = totalOpenTime / eventTickets.length;

    return avgOpenTime;
}

export function getAvgOpenTimeByTickets(ticketArray: Ticket[]) {
    const closedTickets = ticketArray.filter(ticket => ticket.closed_at !== null);

    let avgOpenTime;

    if (closedTickets.length < 1) {
        return null;
    } else {
        const totalOpenTime = ticketArray.reduce((totalDuration, ticket) => {
            if (ticket.created_at && ticket.closed_at) {
                const created_at = new Date(ticket.created_at).getTime();
                const closed_at = new Date(ticket.closed_at).getTime();
                return totalDuration + (closed_at - created_at);
            }
            return totalDuration;
        }, 0);

        avgOpenTime = totalOpenTime / ticketArray.length;
        return avgOpenTime;
    }
}

export async function getTeamTicketsInfo(event_code: string, team: number) {
    let teamTicketArray = await db.query.tickets.findMany({
        where: and(
            eq(tickets.event_code, event_code),
            eq(tickets.team, team)
        ),
        orderBy: [desc(tickets.created_at)],
    }) as Ticket[];

    if (!teamTicketArray) {
        teamTicketArray = [];
    }

    const longestTicketOpenTime = getLongestTicketOpenTime(teamTicketArray);
    const longestTicket = getLongestTicket(teamTicketArray);

    const avgOpenTime = getAvgOpenTimeByTickets(teamTicketArray);

    const ticketLinks: string[] = teamTicketArray.map((ticket) => `https://www.ftabuddy.com/app/ticket/${ticket.id}`);

    const ticketLinksCombined: string = ticketLinks.join(", ");

    const ticketSubjects: string[] = teamTicketArray.map((ticket) => ticket.subject);

    const ticketSubjectsCombined: string = ticketSubjects.join(", ");

    const totalOpenTime = getTotalOpenTime(teamTicketArray);

    const teamTicketsInfo: TeamTicketsInfo = {
        team: team,
        tickets: teamTicketArray,
        totalOpenTime: totalOpenTime,
        avgOpenTime: avgOpenTime,
        ticketSubjects: ticketSubjectsCombined,
        ticketLinks: ticketLinksCombined,
        longestTicketOpenTime: longestTicketOpenTime,
        longestTicket: longestTicket,
    };

    return teamTicketsInfo;
}

export async function getAllTeamTicketsInfo(event_code: string, teamNumbers: number[]) {
    const allTeamsTicketInfo: TeamTicketsInfo[] = await Promise.all(
        teamNumbers.map(async (teamNumber) => {
            const teamInfo = await getTeamTicketsInfo(event_code, teamNumber);
            return teamInfo;
        })
    );

    const sortedAllTeamsTicketInfo = allTeamsTicketInfo.slice().sort((a, b) => b.totalOpenTime - a.totalOpenTime);

    const filteredAllTeamsTicketInfo = sortedAllTeamsTicketInfo.filter(teamTicketInfo => teamTicketInfo.tickets.length !== 0);

    return filteredAllTeamsTicketInfo;
}

export function getLongestTicketOpenTime(tickets: Ticket[]) {
    const closedTickets = tickets.filter(ticket => ticket.closed_at !== null);

    if (closedTickets.length <= 1) {
        return 0;
    } else {
        const longestTicket = closedTickets.reduce((maxTicket, ticket) => {
            if (ticket.closed_at && maxTicket.closed_at) {
                const openTime = ticket.closed_at.getTime() - ticket.created_at.getTime();
                const minOpenTime = maxTicket.closed_at.getTime() - maxTicket.created_at.getTime();
                return openTime > minOpenTime ? ticket : maxTicket;
            }
            return maxTicket;
        }, closedTickets[0]);

        const openTime = (longestTicket.closed_at && longestTicket.created_at) ? longestTicket.closed_at.getTime() - longestTicket.created_at.getTime() : 0;

        return openTime;
    }
}

export function getLongestTicket(tickets: Ticket[]) {
    const closedTickets = tickets.filter(ticket => ticket.closed_at !== null);

    if (closedTickets.length <= 1) {
        if (tickets.length > 0) {
            return tickets[0];
        } else {
            return null;
        }
    } else {
        const longestTicket = closedTickets.reduce((maxTicket, ticket) => {
            if (ticket.closed_at && maxTicket.closed_at) {
                const openTime = ticket.closed_at.getTime() - ticket.created_at.getTime();
                const minOpenTime = maxTicket.closed_at.getTime() - maxTicket.created_at.getTime();
                return openTime > minOpenTime ? ticket : maxTicket;
            }
            return maxTicket;
        }, closedTickets[0]);


        return longestTicket;
    }
}

export function getTicketOpenTime(ticket: Ticket) {
    if (ticket.closed_at) {
        const openTime = ticket.closed_at.getTime() - ticket.created_at.getTime();
        return openTime;
    }
}