import { z } from "zod";
import { eventProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { db } from "../db/db";
import { pushSubscriptions, tickets, users, events, notes } from "../db/schema";
import { observable } from "@trpc/server/observable";
import { and, asc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { Note, Profile } from "../../shared/types";
import { getEvent } from "../util/get-event";
import { randomUUID } from "crypto";

export const notesRouter = router({

    getAll: eventProcedure.query(async ({ ctx }) => {
        const event = await getEvent(ctx.eventToken as string);

        let eventCodes = [event.code];

        if (event.meshedEvent && event.subEvents) {
            eventCodes = eventCodes.concat(event.subEvents.map((subEvent) => subEvent.code));
        }

        const eventNotes = await db.query.notes.findMany({
            where: inArray(notes.event_code, eventCodes),
            orderBy: [asc(notes.created_at)],
        });

        if (!eventNotes) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Notes not found" });
        }

        return eventNotes as Note[];
    }),

    getAllByAuthor: eventProcedure.input(z.object({
        author_id: z.number(),
    })).query(async ({ ctx, input }) => {
        const notesByAuthor = await db.query.notes.findMany({
            where: and(
                eq(notes.author_id, input.author_id),
            ),
            orderBy: [asc(notes.created_at)],
        });

        if (!notesByAuthor) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No Notes found by provided user" });
        }

        return notesByAuthor as Note[];
    }),

    getAllByTeam: eventProcedure.input(z.object({
        team_number: z.number()
    })).query(async ({ ctx, input }) => {
        const notesByTeam = await db.query.notes.findMany({
            where: and(
                eq(notes.team, input.team_number)
            ),
            orderBy: [asc(notes.created_at)],
        });

        if (!notesByTeam) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No Notes found for provided team" });
        }

        return notesByTeam as Note[];
    }),

    getById: eventProcedure.input(z.object({
        id: z.string().uuid(),
        event_code: z.string()
    })).query(async ({ ctx, input }) => {
        const note = await db.query.notes.findFirst({
            where: and(
                eq(notes.id, input.id),
                eq(notes.event_code, input.event_code),
            )
        });

        if (!note) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }

        return note as Note;
    }),

    create: eventProcedure.input(z.object({
        team: z.number(),
        text: z.string(),
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(ctx.eventToken as string);

        const authorProfile = await db.select({
            id: users.id,
            username: users.username,
            role: users.role,
            admin: users.admin,
        }).from(users).where(eq(users.token, ctx.token as string)) as Profile[];

        if (!authorProfile[0]) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve author Profile" });
        }

        const insert = await db.insert(notes).values({
            id: randomUUID(),
            team: input.team,
            author_id: authorProfile[0].id,
            author: authorProfile[0],
            text: input.text,
            event_code: event.code,
            created_at: new Date(),
            updated_at: new Date(),
        }).returning();

        if (!insert[0]) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create Note" });
        }

        return insert[0] as Note;
    }),

    edit: eventProcedure.input(z.object({
        id: z.string().uuid(),
        new_text: z.string(),
        event_code: z.string()
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(ctx.eventToken as string);

        const note = await db.query.notes.findFirst({
            where: and(
                eq(notes.id, input.id),
                eq(notes.event_code, input.event_code),
            )
        });

        if (!note) {
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

        const update = await db.update(notes).set({
            text: input.new_text
        }).where(eq(notes.id, input.id)).returning();

        if (!update[0]) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update Ticket text" });
        }

        return update[0] as Note;
    }),

    delete: eventProcedure.input(z.object({
        id: z.string().uuid(),
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(ctx.eventToken as string);

        const note = await db.query.notes.findFirst({
            where: eq(notes.id, input.id),
        });

        if (!note) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
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

        const result = await db.delete(notes).where(eq(notes.id, input.id));

        if (!result) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to delete Note" });
        }

        return note.id;
    }),

    // updateSubscription: publicProcedure.input(z.object({
    //     eventToken: z.string(),
    //     note_id: z.string().uuid().optional(),
    //     eventOptions: z.object({
    //         create: z.boolean().optional(),
    //         edit: z.boolean().optional(),
    //         delete: z.boolean().optional(),
    //     }),
    // })).subscription(async ({ctx, input }) => {
    //     const event = await getEvent(input.eventToken);

    //     return observable((emitter) => {
    //         if (input.eventOptions.create === true) {
    //             event.noteUpdateEmitter.on("create", ( data ) => {
    //                 if (input.note_id) {
    //                     if(data.note.id === input.note_id) {
    //                         emitter.next(data);
    //                     }
    //                 } else {
    //                     emitter.next(data);
    //                 }

    //             });
    //         }

    //         if (input.eventOptions.edit === true) {
    //             event.noteUpdateEmitter.on("edit", ( data ) => {
    //                 if (input.note_id) {
    //                     if(data.note_id === input.note_id) {
    //                             emitter.next(data);
    //                     }
    //                 } else {
    //                     emitter.next(data);
    //                 }
    //             });
    //         }

    //         if (input.eventOptions.delete === true) {
    //             event.noteUpdateEmitter.on("delete", ( data ) => {
    //                 if (input.note_id) {
    //                     if(data.note_id === input.note_id) {
    //                         emitter.next(data);
    //                     }
    //                 } else {
    //                     emitter.next(data);
    //                 }
    //             });
    //         }
    //     });
    // }),
});

export async function getEventNotes(event_code: string) {
    const eventNotes = await db.query.notes.findMany({
        where: eq(notes.event_code, event_code),
        orderBy: [asc(notes.created_at)],
    });

    if (!eventNotes) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Unable to find notes for this event" });
    }

    return eventNotes;
}