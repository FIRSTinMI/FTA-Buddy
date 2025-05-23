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
import { deleteSlackMessage, sendSlackMessage, updateSlackMessage } from "../util/slack";

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

        if (event.slackTeam && ticket.slack_channel && ticket.slack_ts) {
            let messageTS = await sendSlackMessage(ticket.slack_channel, event.slackTeam, {
                "blocks": [
                    {
                        "type": "context",
                        "elements": [
                            {
                                "type": "plain_text",
                                "text": `From: ${insert[0].author?.username}`,
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
                                        "text": `${insert[0].text}`
                                    }
                                ]
                            }
                        ]
                    }
                ],
                username: insert[0].author?.username,
            }, ticket.slack_ts);
            await db.update(messages).set({ slack_ts: messageTS, slack_channel: event.slackChannel }).where(eq(messages.id, insert[0].id)).execute();
        }

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

        if (event.slackTeam && message.slack_ts && ticket.slack_channel) {
            await updateSlackMessage(ticket.slack_channel, event.slackTeam, message.slack_ts, {
                "blocks": [
                    {
                        "type": "context",
                        "elements": [
                            {
                                "type": "plain_text",
                                "text": `From: ${update[0].author?.username}`,
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
                                        "text": `${update[0].text}`
                                    }
                                ]
                            }
                        ]
                    }
                ],
                username: update[0].author?.username
            });
        }

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

        if (event.slackTeam && message.slack_ts && message.slack_channel) {
            await deleteSlackMessage(message.slack_channel, event.slackTeam, message.slack_ts);
        }

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

export async function addTicketMessageFromSlack(channel_id: string, message_ts: string, thread_ts: string, text: string, author_id: string) {
    const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.slack_ts, thread_ts),
    });

    if (!ticket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    let user: Profile = { id: -1, role: "CSA", admin: false, username: "Slack User" };

    const insert = await db.insert(messages).values({
        id: randomUUID(),
        ticket_id: ticket.id,
        author_id: user.id,
        author: user,
        text: text,
        event_code: ticket.event_code,
        created_at: new Date(),
        updated_at: new Date(),
        slack_ts: message_ts,
        slack_channel: channel_id,
    }).returning();

    const event = await getEvent("", ticket.event_code);

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
        body: `A new message has been added to Ticket #${ticket.id} by ${user.username}`,
        data: {
            page: "ticket/" + ticket.id,
            ticket_id: ticket.id,
        },
    });

}
