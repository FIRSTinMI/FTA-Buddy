import { z } from "zod";
import { eventProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { db } from "../db/db";
import { pushSubscriptions, tickets, users, events, messages } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { Ticket, Profile, Message} from "../../shared/types";
import { getEvent } from "../util/get-event";
import { observable } from "@trpc/server/observable";
import { ticketAssignNotification, ticketCreateNotification, ticketNotification } from "../../shared/push-notifications";

export interface TicketPost {
    type: "assign" | "status" | "add_message" | "create" | "edit" | "follow" | "delete";
    data: Ticket;
}

export const ticketsRouter = router({

    getAll: eventProcedure.query(async ({ ctx }) => {
        const event = await getEvent(ctx.eventToken as string);

        const eventTickets = await db.query.tickets.findMany({
             where: eq(tickets.event_code, event.code) 
        });

        if (!eventTickets) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Tickets not found" });
        }

        return eventTickets.sort((a, b) => {
            let aTime = a.created_at.getTime();
            let bTime = b.created_at.getTime();
            return aTime - bTime;
        });
    }),

    getAllBy: eventProcedure.input(z.object({
        event_code: z.string().optional(),
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
            where: and(...query)
        });

        if (!results) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No Tickets found by provided criteria" });
        }

        return results.sort((a, b) => {
            let aTime = a.created_at.getTime();
            let bTime = b.created_at.getTime();
            return aTime - bTime;
        });
    }),

    getAuthorProfile: eventProcedure.input(z.object({
        ticket_id: z.number(),
        event_code: z.string().optional(),
    })).query(async ({ctx, input}) => {
        let event;

        if(!input.event_code) {
            event = await getEvent(ctx.eventToken as string)
        } else {
            event = await getEvent(input.event_code);
        }

        const ticket = await db.query.tickets.findFirst({
            where: and(
                eq(tickets.event_code, event.code),
                eq(tickets.id, input.ticket_id)
            )
        });

        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No Tickets found by provided User" });
        }

        const profile = ticket.author as Profile;
        
        if (!profile) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve author Profile" });
        }

        return profile;
    }),

    getById: eventProcedure.input(z.object({
        id: z.number(),
        event_code: z.string(),
    })).query(async ({ ctx, input }) => {
        const ticket = await db.query.tickets.findFirst({
            where: and(
                eq(tickets.id, input.id),
                eq(tickets.event_code, input.event_code),
            )
        });
        
        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }

        return ticket;
    }),

    getAssignedToProfile: eventProcedure.input(z.object({
        id: z.number(),
        event_code: z.string(),
    })).query(async ({ctx, input}) => {
        const event = await getEvent(input.event_code);

        const ticket = await db.query.tickets.findFirst({
            where: and(
                eq(tickets.event_code, event.code),
                eq(tickets.id, input.id)
            )
        });

        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No Tickets found by provided User" });
        }

        const profile = ticket.assigned_to as Profile | null;
        
        if (!profile) {
            console.log("No profile assigned to this ticket")
        }

        return profile;
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

        const insert = await db.insert(tickets).values({
            team: input.team,
            subject: input.subject,
            author_id: authorProfile.id,
            author: {
                id: authorProfile.id,
                username: authorProfile.username,
                role: authorProfile.role,
            },
            assigned_to_id: -1,
            is_open: true,
            text: input.text,
            created_at: new Date(),
            updated_at: new Date(),
            event_code: event.code,
            match_id: input.match_id,
            messages: null,
        }).returning();

        if (!insert[0]) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create Ticket" });
        }

        event.ticketEmitter.emit('create', { 
            ...insert[0], user: { 
                username: authorProfile.username, id: authorProfile.id, role: authorProfile.role 
            } 
        });

        ticketCreateNotification({
            title: `New Ticket: Team ${input.team}, Event ${event.code}`,
            body: input.subject,
            tag: `Ticket Created`,
            data: {
                page: 'ticket/' + insert[0].id,
            },
        });

        // sendNotification(event.users.filter(user => user.id === authorProfile.id).map(user => user.id), {
        //     title: `New Ticket: Team ${input.team}`,
        //     body: input.subject,
        //     tag: 'Ticket Created',
        //     data: {
        //         page: 'ticket/' + insert[0].id,
        //     }
        // });

        return insert[0];
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

        const update = await db.update(tickets).set({
            is_open: input.new_status,
            closed_at: !input.new_status ? new Date() : null
        }).where(eq(tickets.id, input.id)).returning();

        event.ticketEmitter.emit('status', { 
            ...update[0], user: { 
                username: ticket.author.username, id: ticket.author.id, role: ticket.author.role 
            } 
        });

        //update users who follow this ticket
        // const followers = ticket.followers as number[];

        if (ticket.followers) {
            ticketNotification(ticket.followers, {
                title: `Ticket ${ticket.id}: Status Changed to ${ticket.is_open ? `OPEN` : `CLOSED`}`,
                body: ticket.subject,
                tag: `Ticket Status Changed`,
                data: {
                    page: 'ticket/' + ticket.id,
                },
            });
        }

        // sendNotification(followers, {
        //     title: `Ticket #${ticket.id} ${input.new_status ? "Reopened" : "Closed"}`,
        //     body: `Team ${ticket.team}`,
        //     tag: 'Ticket Update',
        //     data: {
        //         page: 'ticket/' + ticket.id,
        //     }
        // });

        return update[0];
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
        }).from(users).where(eq(users.id, input.user_id));

        if (!profile[0]) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve User profile" });
        }

        if (ticket.assigned_to_id === input.user_id) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "User is already assigned to this ticket" });
        }

        const update = await db.update(tickets).set({
            assigned_to_id: input.user_id,
            assigned_to: profile[0],
        }).where(eq(tickets.id, input.id)).returning();


        if (!update) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to assign User" });
        }

        ticketAssignNotification(input.user_id, {
            title: `Ticket #${ticket.id} Assigned to You`,
            body: `You have been assigned to ticket #${ticket.id} for team ${ticket.team}`,
            tag: 'Ticket Assigned',
            data: {
                page: 'ticket/' + ticket.id,
            }
        });

        if (ticket.followers) {
            ticketNotification(ticket.followers, {
                title: `Ticket ${ticket.id}: Reassigned to ${profile[0].username}`,
                body: ticket.subject,
                tag: `Ticket Reassigned`,
                data: {
                    page: 'ticket/' + ticket.id,
                },
            });
        }

        event.ticketEmitter.emit('assign', { 
            ...update, user: { 
                username: profile[0].username, id: profile[0].id, role: profile[0].role 
            } 
        });

        return profile;
    }),

    unAssign: eventProcedure.input(z.object({
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

        if (ticket.assigned_to_id === -1) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "No user currently assigned to this ticket" });
        }

        const user_profile = ticket.assigned_to;

        const update = await db.update(tickets).set({
            assigned_to_id: -1,
            assigned_to: null,
        }).where(eq(tickets.id, input.id)).returning();


        if (!update) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update assignation status" });
        }

        if (user_profile?.id) {
            event.ticketEmitter.emit('assign', {
                ...update[0], user: { 
                    username: user_profile.username, id: user_profile.id, role: user_profile.role 
                }  
            });

            ticketAssignNotification(user_profile.id, {
                title: `Unassigned from Ticket #${ticket.id}`,
                body: `You have been unassigned from ticket #${ticket.id} for Team #${ticket.team}`,
                tag: 'Ticket Assigned',
                data: {
                    page: 'ticket/' + ticket.id,
                }
            });

            if (ticket.followers) {
                ticketNotification(ticket.followers, {
                    title: `Ticket ${ticket.id}: Unassigned ${user_profile.username}`,
                    body: `User ${user_profile.username} has been unassigned from Ticket #${ticket.id} for Team #${ticket.team}`,
                    tag: `Ticket Assigned`,
                    data: {
                        page: 'ticket/' + ticket.id,
                    },
                });
            }
        }

        return user_profile;
    }),

    editText: eventProcedure.input(z.object({
        id: z.number(),
        new_text: z.string(),
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

        const update = await db.update(tickets).set({
            text: input.new_text
        }).where(eq(tickets.id, input.id)).returning();

        if (!update) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update Ticket text" });
        }

        event.ticketEmitter.emit('edit', { 
            ...update, user: { 
                username: ticket.author.username, id: ticket.author.id, role: ticket.author.role 
            } 
        });

        return update;
    }),

    editSubject: eventProcedure.input(z.object({
        id: z.number(),
        new_subject: z.string(),
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

        const update = await db.update(tickets).set({
            text: input.new_subject
        }).where(eq(tickets.id, input.id)).returning();

        if (!update) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update Ticket subject" });
        }

        event.ticketEmitter.emit('edit', { 
            ...update, user: { 
                username: ticket.author.username, id: ticket.author.id, role: ticket.author.role 
            } 
        });

        return update;
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

        const followers = ticket.followers as number[];

        let updatedFollowers: number[] = [];
        let update;

        if (followers.includes(ctx.user.id)) {
            followers.push(ctx.user.id);

            update = await db.update(tickets).set({
                followers: followers,
            }).where(eq(tickets.id, input.id)).returning();

        } else if (!followers.includes(ctx.user.id)) {
            update = await db.update(tickets).set({
                followers: updatedFollowers,
            }).where(eq(tickets.id, input.id)).returning();
        } else {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Current User is already following provided Ticket" });
        }

        if (!update) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update Ticket followers" });
        }

        event.ticketEmitter.emit('follow', { 
            ...update, user: { 
                username: ticket.author.username, id: ticket.author.id, role: ticket.author.role 
            } 
        });
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

        let result;

        if (ticket.messages === null || ticket.is_open === false) {
            result = await db.delete(tickets).where(eq(tickets.id, input.id));
        } else {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Unable to delete Ticket with linked Messages" });
        }

        if (!result) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to delete Ticket" });
        }

        event.ticketEmitter.emit('delete', { 
            ...result, user: { 
                username: ticket.author.username, id: ticket.author.id, role: ticket.author.role 
            } 
        });

        return result;
    }),

    addMessage: eventProcedure.input(z.object({
        ticket_id: z.number(),
        message_id: z.string().uuid(),
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

        let ticketMessages = ticket.messages as Message[];
        let newMessage: Message | undefined;

        newMessage = await db.query.messages.findFirst({
            where: and(
                eq(messages.ticket_id, input.ticket_id),
                eq(messages.id, input.message_id),
            )
        });

        let update;

        if (newMessage) {
            ticketMessages.push(newMessage);

            update = await db.update(tickets).set({
                messages: ticketMessages,
            }).where(eq(tickets.id, input.ticket_id)).returning();
        

            if (!update) {
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update Ticket Messages" });
            }

            event.ticketEmitter.emit('add_message', { 
                ...update, user: { 
                    username: newMessage.author.username, id: newMessage.author.id, role: newMessage.author.role 
                } 
            });

            if (ticket.followers) {
                ticketNotification(ticket.followers.filter(user_id => user_id !== newMessage.author.id).map(user_id => user_id), {
                    title: `New Message: Ticket #${ticket.id} by ${newMessage.author.username}`,
                    body: newMessage.text,
                    tag: 'New Message Added',
                    data: {
                        page: 'ticket/' + ticket.id,
                    }
                });
            }
        }
        return update;
    }),

    ticketCreateSubscription: publicProcedure.input(z.object({
        eventToken: z.string()
    })).subscription(async ({ input }) => {
        const event = await getEvent(input.eventToken);

        return observable<TicketPost>((emitter) => {
            const listener = (type: "create", tkt: Ticket) => {
                emitter.next({
                    type,
                    data: tkt
                });
            };

            event.ticketEmitter.on('create', (tkt) => listener("create", tkt));

            return () => {
                event.ticketEmitter.removeListener('create', (tkt) => listener("create", tkt));
            };
        });
    }),



    foregroundUpdater: publicProcedure.input(z.object({
        eventToken: z.string()
    })).subscription(async ({ input }) => {
        const event = await getEvent(input.eventToken);

        return observable<TicketPost>((emitter) => {
            const listener = (type: "assign" | "status" | "create" | "add_message", tkt: Ticket) => {
                emitter.next({
                    type,
                    data: tkt
                });
            };

            event.ticketEmitter.on('create', (tkt) => listener("create", tkt));
            event.ticketEmitter.on('add_message', (tkt) => listener("add_message", tkt));
            event.ticketEmitter.on('status', (tkt) => listener("status", tkt));
            event.ticketEmitter.on('assign', (tkt) => listener("assign", tkt));
            return () => {
                event.ticketEmitter.removeListener('add_message', (tkt) => listener("add_message", tkt));
                event.ticketEmitter.removeListener('status', (tkt) => listener("status", tkt));
                event.ticketEmitter.removeListener('assign', (tkt) => listener("assign", tkt));
                event.ticketEmitter.removeListener('create', (tkt) => listener("create", tkt));
            };
        });
    }),

    ticketUpdater: publicProcedure.input(z.object({
        id: z.number(),
        eventToken: z.string(),
        user_id: z.number(),
    })).subscription(async ({ input }) => {
        const authEvent = await getEvent(input.eventToken);

        if (!authEvent) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const ticket = await db.query.tickets.findFirst({
            where: eq(tickets.id, input.id)
        });
        
        if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }

        let event;
        if (authEvent.code !== ticket.event_code) {
            event = await getEvent("", ticket.event_code ?? '');
        } else {
            event = authEvent;
        }

        const followers = ticket.followers as number[];

        if (!followers.includes(input.user_id)){
            throw new TRPCError({ code: "BAD_REQUEST", message: "Already following Ticket" });
        } else {
            followers.push(input.user_id)
        }

        return observable<TicketPost>((emitter) => {
            const listener = (type: "assign" | "status" | "create" | "add_message", tkt: Ticket) => {
                if ((tkt.id === input.id)) {
                    emitter.next({
                        type,
                        data: tkt
                    });
                }
            };

            event.ticketEmitter.on('create', (tkt) => listener("create", tkt));
            event.ticketEmitter.on('add_message', (tkt) => listener("add_message", tkt));
            event.ticketEmitter.on('status', (tkt) => listener("status", tkt));
            event.ticketEmitter.on('assign', (tkt) => listener("assign", tkt));
            return () => {
                event.ticketEmitter.removeListener('add_message', (tkt) => listener("add_message", tkt));
                event.ticketEmitter.removeListener('status', (tkt) => listener("status", tkt));
                event.ticketEmitter.removeListener('assign', (tkt) => listener("assign", tkt));
                event.ticketEmitter.removeListener('create', (tkt) => listener("create", tkt));
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

export async function getEventTickets( event_code: string ) {
    const eventTickets = await db.query.tickets.findMany({
         where: eq(tickets.event_code, event_code) 
    });

    if (!eventTickets) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tickets not found" });
    }

    return eventTickets as Ticket[];
}