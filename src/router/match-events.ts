import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { MatchEvent, MatchEventUpdateEventData, Note, Profile } from "../../shared/types";
import { db } from "../db/db";
import { matchEvents, notes, users } from "../db/schema";
import { eventProcedure, publicProcedure, router } from "../trpc";
import { getEvent } from "../util/get-event";
import { subscriptionQueue } from "../util/subscription";

export const matchEventsRouter = router({
    /** Get all match events for the current event, filtered by status. */
    getAll: eventProcedure
        .input(
            z
                .object({
                    status: z.enum(["active", "dismissed", "converted"]).optional(),
                    team: z.number().optional(),
                })
                .optional(),
        )
        .query(async ({ ctx, input }) => {
            const event = await getEvent(ctx.event.token);
            const filters = [eq(matchEvents.event_code, event.code)];
            if (input?.status) filters.push(eq(matchEvents.status, input.status));
            if (input?.team) filters.push(eq(matchEvents.team, input.team));

            const rows = await db
                .select()
                .from(matchEvents)
                .where(and(...filters))
                .orderBy(desc(matchEvents.created_at))
                .execute();

            return rows as MatchEvent[];
        }),

    /** Get match events for a specific team across all their matches (for field view summaries). */
    getByTeam: eventProcedure
        .input(z.object({ team_number: z.number() }))
        .query(async ({ ctx, input }) => {
            const event = await getEvent(ctx.event.token);
            const rows = await db
                .select()
                .from(matchEvents)
                .where(
                    and(
                        eq(matchEvents.event_code, event.code),
                        eq(matchEvents.team, input.team_number),
                        eq(matchEvents.status, "active"),
                    ),
                )
                .orderBy(desc(matchEvents.created_at))
                .execute();

            return rows as MatchEvent[];
        }),

    /** Dismiss a match event (mark as not needing follow-up). */
    dismiss: eventProcedure
        .input(z.object({ id: z.uuid() }))
        .mutation(async ({ ctx, input }) => {
            const event = await getEvent(ctx.event.token);
            const result = await db
                .update(matchEvents)
                .set({ status: "dismissed" })
                .where(and(eq(matchEvents.id, input.id), eq(matchEvents.event_code, event.code)))
                .returning()
                .execute();

            if (result.length === 0) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Match event not found" });
            }

            event.matchEventEmitter.emit("dismiss", {
                kind: "match_event_dismiss",
                id: input.id,
            });

            return { success: true };
        }),

    /** Convert a match event into a full note for follow-up. */
    convertToNote: eventProcedure
        .input(
            z.object({
                id: z.uuid(),
                text: z.string().optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const event = await getEvent(ctx.event.token);

            // Get the match event
            const [matchEvent] = await db
                .select()
                .from(matchEvents)
                .where(and(eq(matchEvents.id, input.id), eq(matchEvents.event_code, event.code)))
                .execute();

            if (!matchEvent) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Match event not found" });
            }

            if (matchEvent.status === "converted") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Event already converted to a note" });
            }

            // Look up the current user from token
            const authorProfile = (await db
                .select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
                .from(users)
                .where(eq(users.token, ctx.token as string))) as Profile[];
            if (!authorProfile[0])
                throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve author profile" });

            // Map log issue types to note issue types
            const issueTypeMap: Record<string, string> = {
                "Code disconnect": "RoboRioIssue",
                "RIO disconnect": "RoboRioIssue",
                "Radio disconnect": "RadioIssue",
                "DS disconnect": "DSIssue",
                "Brownout": "RobotPwrIssue",
                "Large spike in ping": "RadioIssue",
                "Sustained high ping": "RadioIssue",
                "Low signal": "RadioIssue",
                "High BWU": "RadioIssue",
            };

            const noteText =
                input.text || `[Auto] ${matchEvent.issue} detected in match ${matchEvent.match_number} (${Math.abs(matchEvent.duration ?? 0).toFixed(0)}s)`;

            const noteId = randomUUID();
            const [newNote] = await db
                .insert(notes)
                .values({
                    id: noteId,
                    text: noteText,
                    author_id: authorProfile[0].id,
                    author: authorProfile[0],
                    team: matchEvent.team,
                    note_type: "TeamIssue",
                    resolution_status: "Open",
                    issue_type: (issueTypeMap[matchEvent.issue] ?? "Other") as any,
                    match_number: matchEvent.match_number,
                    play_number: matchEvent.play_number,
                    tournament_level: matchEvent.level as any,
                    event_code: event.code,
                    match_id: matchEvent.match_id,
                })
                .returning()
                .execute();

            // Update match event status
            await db
                .update(matchEvents)
                .set({ status: "converted", converted_note_id: noteId })
                .where(eq(matchEvents.id, input.id))
                .execute();

            // Emit events
            event.noteUpdateEmitter.emit("create", { kind: "create", note: newNote as Note });
            event.matchEventEmitter.emit("convert", {
                kind: "match_event_convert",
                id: input.id,
                note_id: noteId,
            });

            return { noteId, success: true };
        }),

    /** Dismiss all active match events for this event. */
    dismissAll: eventProcedure.mutation(async ({ ctx }) => {
        const event = await getEvent(ctx.event.token);
        const dismissed = await db
            .update(matchEvents)
            .set({ status: "dismissed" })
            .where(and(eq(matchEvents.event_code, event.code), eq(matchEvents.status, "active")))
            .returning({ id: matchEvents.id })
            .execute();

        for (const row of dismissed) {
            event.matchEventEmitter.emit("dismiss", {
                kind: "match_event_dismiss",
                id: row.id,
            });
        }

        return { dismissed: dismissed.length };
    }),

    /** Real-time subscription for match event updates. */
    updateSubscription: publicProcedure
        .input(z.object({ eventToken: z.string() }))
        .subscription(async function* ({ input, signal }) {
            const event = await getEvent(input.eventToken);
            const { push, drain } = subscriptionQueue<MatchEventUpdateEventData>(signal!);

            const handlers: { event: keyof import("../../shared/types").MatchEventUpdateEvents; fn: (...args: any[]) => void }[] = [];

            function registerHandler<K extends keyof import("../../shared/types").MatchEventUpdateEvents>(
                eventName: K,
                handler: import("../../shared/types").MatchEventUpdateEvents[K],
            ) {
                handlers.push({ event: eventName, fn: handler as any });
                event.matchEventEmitter.on(eventName, handler);
            }

            registerHandler("create", (data) => push(data));
            registerHandler("dismiss", (data) => push(data));
            registerHandler("convert", (data) => push(data));

            try {
                yield* drain();
            } finally {
                for (const h of handlers) {
                    event.matchEventEmitter.off(h.event, h.fn as any);
                }
            }
        }),
});
