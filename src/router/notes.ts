import { z } from "zod";
import { eventProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { db } from "../db/db";
import { pushSubscriptions, tickets, users, events, notes } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { Note } from "../../shared/types";
import { getEvent } from "../util/get-event";
import { observable } from "@trpc/server/observable";
import { sendNotification } from "../util/push-notifications";
import { randomUUID } from "crypto";


export const notesRouter = router({

    getAll: eventProcedure.query(async ({ ctx }) => {
        const event = await getEvent(ctx.eventToken as string) || await db.query.events.findFirst({
            where: eq(events.token, ctx.eventToken as string)
        });

        if (!event) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const eventNotes = await db.query.notes.findMany({
             where: eq(notes.event_code, event.code) 
        });

        if (!eventNotes) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Notes not found" });
        }

        return eventNotes.sort((a, b) => {
            let aTime = a.created_at.getTime();
            let bTime = b.created_at.getTime();
            return aTime - bTime;
        });
    }),

    getAllByAuthor: eventProcedure.input(z.object({
        author_id: z.number(),
        event_code: z.string(),
    })).query(async ({ctx, input}) => {
        const event = await getEvent(ctx.eventToken as string) || await db.query.events.findFirst({
            where: eq(events.token, ctx.eventToken as string)
        });

        if (!event) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const notesByAuthor = await db.query.notes.findMany({
            where: and(
                eq(notes.event_code, event.code),
                eq(notes.author_id, input.author_id)
            )
        });

        if (!notesByAuthor) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No Notes found by provided user" });
        }

        return notesByAuthor.sort((a, b) => {
            let aTime = a.created_at.getTime();
            let bTime = b.created_at.getTime();
            return aTime - bTime;
        });    
    }),

    getAllByTeam: eventProcedure.input(z.object({
        team_number: z.number()
    })).query(async ({ctx, input}) => {
        const event = await getEvent(ctx.eventToken as string) || await db.query.events.findFirst({
            where: eq(events.token, ctx.eventToken as string)
        });

        if (!event) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const notesByTeam = await db.query.tickets.findMany({
            where: and(
                eq(notes.event_code, event.code), 
                eq(notes.team, input.team_number)
            )
        });

        if (!notesByTeam) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No Notes found for provided team" });
        }

        return notesByTeam.sort((a, b) => {
            let aTime = a.created_at.getTime();
            let bTime = b.created_at.getTime();
            return aTime - bTime;
        });    
    }),

    create: protectedProcedure.input(z.object({
        team: z.number(),
        text: z.string(),
        author_id: z.number(),
    })).query(async ({ ctx, input }) => {
        const event = await getEvent(ctx.eventToken as string) || await db.query.events.findFirst({
            where: eq(events.token, ctx.eventToken as string)
        });

        if (!event) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const insert = await db.insert(notes).values({
            id: randomUUID(),
            team: input.team,
            author_id: input.author_id,
            text: input.text,
            created_at: new Date(),
            updated_at: new Date(),
        }).returning();

        if (!insert[0]) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create Note" });
        }

        return insert[0];
    }),

    getById: protectedProcedure.input(z.object({
        id: z.string().uuid(),
        event_code: z.string()
    })).query(async ({ ctx, input }) => {
        const event = await db.query.events.findFirst({
            where: eq(events.token, ctx.eventToken as string)
        });
        
        if (!event) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const note = await db.query.notes.findFirst({
            where: and(
                eq(notes.id, input.id),
                eq(notes.event_code, input.event_code),
            )
        });
        
        if (!note) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }

        return note;
    }),

    editText: protectedProcedure.input(z.object({
        note_id: z.string().uuid(),
        new_text: z.string(),
    })).query(async ({ ctx, input }) => {
        const event = await db.query.events.findFirst({
            where: eq(events.token, ctx.eventToken as string)
        });
        
        if (!event) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const note = await db.query.tickets.findFirst({
            where: and(
                eq(tickets.id, input.note_id),
                eq(tickets.event_code, event.code),
            )
        });
        
        if (!note) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }

        const update = await db.update(notes).set({
            text: input.new_text
        }).where(eq(notes.id, input.note_id)).returning();

        if (!update) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update Ticket text" });
        }

        return update;
    }),

});