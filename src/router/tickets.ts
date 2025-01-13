import { z } from "zod";
import { eventProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { db } from "../db/db";
import { pushSubscriptions, tickets, users, events, messages } from "../db/schema";
import type { User } from "../db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { Ticket, Profile} from "../../shared/types";
import { getEvent } from "../util/get-event";
import { observable } from "@trpc/server/observable";
import { messagesRouter } from "./messages";
import { AwsRequestSigner } from "google-auth-library";
import { dataSourceToNumber } from "@the-orange-alliance/api/lib/esm/models/types/DataSource";

const messageRouter = messagesRouter;

export const ticketsRouter = router({

    getAllWithMessages: eventProcedure.query(async ({ ctx }) => {
        const event = await getEvent(ctx.eventToken as string);

        const eventTickets = await db.query.tickets.findMany({
            where: eq(tickets.event_code, event.code),
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
    })).query(async ({ctx, input}) => {
        let query = [];

        if (input.event_code) {
            query.push(eq(tickets.event_code, input.event_code));
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
        const ticket = await db.query.tickets.findFirst({
            where: and(
                eq(tickets.id, input.id),
                eq(tickets.event_code, input.event_code),
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

    create: eventProcedure.input(z.object({
        team: z.number(),
        subject: z.string(),
        text: z.string(),
        match_id: z.string().optional(),
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(ctx.eventToken as string);

        const authorProfile = await db.query.users.findFirst({
            where: eq(users.token, ctx.token ?? "")
        });

        if (!authorProfile) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve author Profile" });
        }

        let insert;
        if (input.match_id) {
            insert = await db.insert(tickets).values({
                team: input.team,
                subject: input.subject,
                author_id: authorProfile.id,
                author: authorProfile as Profile, // Ensure author is not null
                assigned_to_id: null,
                assigned_to: null,
                is_open: true,
                text: input.text,
                created_at: new Date(),
                updated_at: new Date(),
                event_code: event.code,
                followers: [],
                match_id: input.match_id,
            }).returning();
        } else {
            insert = await db.insert(tickets).values({
                team: input.team,
                subject: input.subject,
                author_id: authorProfile.id,
                author: authorProfile as Profile, // Ensure author is not null
                assigned_to_id: null,
                assigned_to: null,
                is_open: true,
                text: input.text,
                created_at: new Date(),
                updated_at: new Date(),
                event_code: event.code,
                followers: [],
                match_id: null,
            }).returning();
        }
        

        if (!insert[0]) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create Ticket" });
        }

        event.ticketUpdateEmitter.emit("create", {
            kind: "create",
            ticket: insert[0] as Ticket,
        });

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
            closed_at: !input.new_status ? new Date() : null
        }).where(eq(tickets.id, input.id)).returning();

        event.ticketUpdateEmitter.emit("status", {
            kind: "status",
            ticket_id: update[0].id,
            is_open: update[0].is_open
        });

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
        
        } else if (followers.includes(ctx.user.id) && input.follow === true){

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

        const ticketMessages = db.query.messages.findMany({
            where: eq(messages.ticket_id, input.id)
        });

        let result;

        if (!ticketMessages || !ticket.followers || !ticket.is_open) {
            result = await db.delete(tickets).where(eq(tickets.id, input.id));
        } else {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Unable to delete Ticket that has linked Messages or followers or is closed" });
        }

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
        }),
    })).subscription(async ({ ctx, input }) => {
        const event = await getEvent(input.eventToken);

        return observable((emitter) => {
            if (input.eventOptions.create === true) {
                event.ticketUpdateEmitter.on("create", ( data ) => {
                    if (input.ticket_id) {
                        if(data.ticket.id === input.ticket_id) {
                            emitter.next(data);
                        }
                    } else {
                        emitter.next(data);
                    }
                    
                });
            }

            if (input.eventOptions.assign === true) {
                event.ticketUpdateEmitter.on("assign", ( data ) => {
                    if (input.ticket_id) {
                        if(data.ticket_id === input.ticket_id) {
                            emitter.next(data);
                        }
                    } else {
                        emitter.next(data);
                    }
                });
            }

            if (input.eventOptions.status === true) {
                event.ticketUpdateEmitter.on("status", ( data ) => {
                    if (input.ticket_id) {
                        if(data.ticket_id === input.ticket_id) {
                            emitter.next(data);
                        }
                    } else {
                        emitter.next(data);
                    }
                });
            }

            if (input.eventOptions.follow === true) {
                event.ticketUpdateEmitter.on("follow", ( data ) => {
                    if (input.ticket_id) {
                        if(data.ticket_id === input.ticket_id) {
                            emitter.next(data);
                        }
                    } else {
                        emitter.next(data);
                    }
                });
            }

            if (input.eventOptions.delete_ticket === true) {
                event.ticketUpdateEmitter.on("delete_ticket", ( data ) => {
                    if (input.ticket_id) {
                        if(data.ticket_id === input.ticket_id) {
                            emitter.next(data);
                        }
                    } else {
                        emitter.next(data);
                    }
                });
            }

            if (input.eventOptions.add_message === true) {
                event.ticketUpdateEmitter.on("add_message", ( data ) => {
                    if (input.ticket_id) {
                        if(data.message.ticket_id === input.ticket_id) {
                            emitter.next(data);
                        }
                    } else {
                        emitter.next(data);
                    }
                });
            }

            if (input.eventOptions.edit_message === true) {
                event.ticketUpdateEmitter.on("edit_message", ( data ) => {
                    if (input.ticket_id) {
                        if(data.message.ticket_id === input.ticket_id) {
                            emitter.next(data);
                        }
                    } else {
                        emitter.next(data);
                    }
                });
            }

            if (input.eventOptions.delete_message === true) {
                event.ticketUpdateEmitter.on("delete_message", ( data ) => {
                    if (input.ticket_id) {
                        if(data.ticket_id === input.ticket_id) {
                            emitter.next(data);
                        }
                    } else {
                        emitter.next(data);
                    }
                });
            }

            return () => {
                event.ticketUpdateEmitter.removeAllListeners();
			};
        });
    }),

    pushSubscription: publicProcedure.input(z.object({
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
        }),
    })).subscription(async ({ ctx, input }) => {
        const event = await getEvent(input.eventToken);

        return observable((emitter) => {
            if (input.eventOptions.create === true) {
                event.ticketUpdateEmitter.on("create", ( data ) => {
                    if (input.ticket_id) {
                        if(data.ticket.id === input.ticket_id) {
                            emitter.next(data);
                        }
                    } else {
                        emitter.next(data);
                    }
                    
                });
            }

            if (input.eventOptions.assign === true) {
                event.ticketUpdateEmitter.on("assign", ( data ) => {
                    if (input.ticket_id) {
                        if(data.ticket_id === input.ticket_id) {
                            emitter.next(data);
                        }
                    } else {
                        emitter.next(data);
                    }
                });
            }

            if (input.eventOptions.status === true) {
                event.ticketUpdateEmitter.on("status", ( data ) => {
                    if (input.ticket_id) {
                        if(data.ticket_id === input.ticket_id) {
                            emitter.next(data);
                        }
                    } else {
                        emitter.next(data);
                    }
                });
            }

            if (input.eventOptions.follow === true) {
                event.ticketUpdateEmitter.on("follow", ( data ) => {
                    if (input.ticket_id) {
                        if(data.ticket_id === input.ticket_id) {
                            emitter.next(data);
                        }
                    } else {
                        emitter.next(data);
                    }
                });
            }

            if (input.eventOptions.delete_ticket === true) {
                event.ticketUpdateEmitter.on("delete_ticket", ( data ) => {
                    if (input.ticket_id) {
                        if(data.ticket_id === input.ticket_id) {
                            emitter.next(data);
                        }
                    } else {
                        emitter.next(data);
                    }
                });
            }

            if (input.eventOptions.add_message === true) {
                event.ticketUpdateEmitter.on("add_message", ( data ) => {
                    if (input.ticket_id) {
                        if(data.message.ticket_id === input.ticket_id) {
                            emitter.next(data);
                        }
                    } else {
                        emitter.next(data);
                    }
                });
            }

            if (input.eventOptions.edit_message === true) {
                event.ticketUpdateEmitter.on("edit_message", ( data ) => {
                    if (input.ticket_id) {
                        if(data.message.ticket_id === input.ticket_id) {
                            emitter.next(data);
                        }
                    } else {
                        emitter.next(data);
                    }
                });
            }

            if (input.eventOptions.delete_message === true) {
                event.ticketUpdateEmitter.on("delete_message", ( data ) => {
                    if (input.ticket_id) {
                        if(data.ticket_id === input.ticket_id) {
                            emitter.next(data);
                        }
                    } else {
                        emitter.next(data);
                    }
                });
            }

            return () => {
                event.ticketUpdateEmitter.removeAllListeners();
			};
        });
    }),
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