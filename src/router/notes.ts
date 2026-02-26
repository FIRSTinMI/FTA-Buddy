import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { on } from "events";
import { z } from "zod";
import { notificationEmitter } from "..";
import { formatTimeShortNoAgoMinutes } from "../../shared/formatTime";
import type { Notification } from "../../shared/types";
import { FmsNoteMetadata, Message, Note, NoteUpdateEventData, NoteUpdateEvents, Profile } from "../../shared/types";
import { db } from "../db/db";
import { events, matchLogs, messages, notes, pushSubscriptions, users } from "../db/schema";
import { eventProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { getEvent } from "../util/get-event";
import { createNotification } from "../util/push-notifications";
import { generateReport } from "../util/report-generator";
import {
	addSlackReaction,
	deleteSlackMessage,
	removeSlackReaction,
	sendSlackMessage,
	updateSlackMessage,
} from "../util/slack";
import { subscriptionQueue } from "../util/subscription";

/**
 * Given an event code and match number (plus optional play number / level),
 * find the most-recent matching match_logs row and return its id.
 * Returns undefined when no match log exists yet.
 */
async function resolveMatchId(
	eventCode: string,
	matchNumber: number | null | undefined,
	playNumber?: number | null,
	level?: string | null,
): Promise<string | undefined> {
	if (!matchNumber) return undefined;

	const filters = [eq(matchLogs.event, eventCode), eq(matchLogs.match_number, matchNumber)];
	if (playNumber != null) filters.push(eq(matchLogs.play_number, playNumber));
	if (level) filters.push(eq(matchLogs.level, level as any));

	const row = await db.query.matchLogs.findFirst({
		where: and(...filters),
		orderBy: [desc(matchLogs.start_time)],
		columns: { id: true },
	});

	return row?.id;
}

export type TeamNotesInfo = {
	team: number;
	totalOpenTime: number;
	avgOpenTime: number | null;
	notes: Note[];
	noteSubjects: string;
	noteLinks: string;
	longestNoteOpenTime: number;
	longestNote: Note | null;
};

export function getTotalOpenTime(noteArray: Note[]) {
	return noteArray.reduce((total, n) => {
		if (n.created_at && n.closed_at) {
			return total + (new Date(n.closed_at).getTime() - new Date(n.created_at).getTime());
		}
		return total;
	}, 0);
}

export function getAvgOpenTimeByNotes(noteArray: Note[]) {
	const closed = noteArray.filter((n) => n.closed_at !== null);
	if (closed.length < 1) return null;
	const total = noteArray.reduce((sum, n) => {
		if (n.created_at && n.closed_at) {
			return sum + (new Date(n.closed_at).getTime() - new Date(n.created_at).getTime());
		}
		return sum;
	}, 0);
	return total / noteArray.length;
}

export async function getAllAvgOpenTime(event_code: string) {
	const eventNotes = await db.query.notes.findMany({
		where: eq(notes.event_code, event_code),
		orderBy: [desc(notes.created_at)],
	});
	if (!eventNotes || eventNotes.length < 1) return 0;
	const total = eventNotes.reduce((sum, n) => {
		if (n.created_at && n.closed_at) {
			return sum + (new Date(n.closed_at).getTime() - new Date(n.created_at).getTime());
		}
		return sum;
	}, 0);
	return total / eventNotes.length;
}

export function getLongestNoteOpenTime(noteArray: Note[]) {
	const closed = noteArray.filter((n) => n.closed_at !== null);
	if (closed.length <= 1) return 0;
	const longest = closed.reduce((max, n) => {
		if (n.closed_at && max.closed_at) {
			const t = new Date(n.closed_at).getTime() - new Date(n.created_at).getTime();
			const mt = new Date(max.closed_at).getTime() - new Date(max.created_at).getTime();
			return t > mt ? n : max;
		}
		return max;
	}, closed[0]);
	return longest.closed_at ? new Date(longest.closed_at).getTime() - new Date(longest.created_at).getTime() : 0;
}

export function getLongestNote(noteArray: Note[]) {
	const closed = noteArray.filter((n) => n.closed_at !== null);
	if (closed.length <= 1) return noteArray.length > 0 ? noteArray[0] : null;
	return closed.reduce((max, n) => {
		if (n.closed_at && max.closed_at) {
			const t = new Date(n.closed_at).getTime() - new Date(n.created_at).getTime();
			const mt = new Date(max.closed_at).getTime() - new Date(max.created_at).getTime();
			return t > mt ? n : max;
		}
		return max;
	}, closed[0]);
}

export function getNoteOpenTime(note: Note) {
	if (note.closed_at) {
		return new Date(note.closed_at).getTime() - new Date(note.created_at).getTime();
	}
}

export async function getTeamNotesInfo(event_code: string, team: number): Promise<TeamNotesInfo> {
	let teamNotes = (await db.query.notes.findMany({
		where: and(eq(notes.event_code, event_code), eq(notes.team, team)),
		orderBy: [desc(notes.created_at)],
	})) as Note[];
	if (!teamNotes) teamNotes = [];

	const longestNoteOpenTime = getLongestNoteOpenTime(teamNotes);
	const longestNote = getLongestNote(teamNotes);
	const avgOpenTime = getAvgOpenTimeByNotes(teamNotes);
	const noteLinks = teamNotes.map((n) => `https://www.ftabuddy.com/support/view/${n.id}`).join(", ");
	const noteSubjects = teamNotes.map((n) => n.text.substring(0, 60)).join(", ");
	const totalOpenTime = getTotalOpenTime(teamNotes);

	return {
		team,
		notes: teamNotes,
		totalOpenTime,
		avgOpenTime,
		noteSubjects,
		noteLinks,
		longestNoteOpenTime,
		longestNote,
	};
}

export async function getAllTeamNotesInfo(event_code: string, teamNumbers: number[]) {
	const all = await Promise.all(teamNumbers.map((t) => getTeamNotesInfo(event_code, t)));
	return all
		.slice()
		.sort((a, b) => b.totalOpenTime - a.totalOpenTime)
		.filter((info) => info.notes.length !== 0);
}

// #region Slack Integration

export function createSlackNoteMessage(
	note_id: string,
	team_number: number | null,
	author: string,
	subject: string,
	body: string,
	match_id?: string,
) {
	const buttons: any[] = [];
	buttons.push({
		type: "button",
		text: { type: "plain_text", text: "View Note", emoji: true },
		url: `https://ftabuddy.com/support/view/${note_id}`,
	});
	if (match_id) {
		buttons.push({
			type: "button",
			text: { type: "plain_text", text: "View Match Log", emoji: true },
			url: `https://ftabuddy.com/logs/${match_id}`,
		});
	}
	return {
		blocks: [
			{
				type: "header",
				text: {
					type: "plain_text",
					text: `New Note${team_number ? ` For Team ${team_number}` : ""}`,
					emoji: true,
				},
			},
			{
				type: "context",
				elements: [{ type: "plain_text", text: `Created by: ${author}`, emoji: true }],
			},
			{
				type: "rich_text",
				elements: [
					{
						type: "rich_text_section",
						elements: [{ type: "text", text: subject, style: { bold: true } }],
					},
				],
			},
			{
				type: "rich_text",
				elements: [
					{
						type: "rich_text_section",
						elements: [{ type: "text", text: body }],
					},
				],
			},
			{ type: "actions", elements: buttons },
		],
	};
}

// #region Messages

const messagesSubRouter = router({
	loadAllForEvent: eventProcedure.input(z.object({ event_code: z.string() })).query(async ({ input }) => {
		return (await db.query.messages.findMany({
			where: eq(messages.event_code, input.event_code),
			orderBy: [asc(messages.created_at)],
		})) as Message[];
	}),

	getById: eventProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }) => {
		const message = await db.query.messages.findFirst({ where: eq(messages.id, input.id) });
		if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
		return message as Message;
	}),

	create: eventProcedure
		.input(
			z.object({
				note_id: z.string().uuid(),
				text: z.string(),
				event_code: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.eventToken as string);

			const note = await db.query.notes.findFirst({
				where: and(eq(notes.id, input.note_id), eq(notes.event_code, input.event_code)),
			});
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

			const authorProfile = (await db
				.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
				.from(users)
				.where(eq(users.token, ctx.token as string))) as Profile[];
			if (!authorProfile[0])
				throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve author Profile" });

			const insert = await db
				.insert(messages)
				.values({
					id: randomUUID(),
					note_id: note.id,
					author_id: authorProfile[0].id,
					author: authorProfile[0],
					text: input.text,
					event_code: note.event_code,
					created_at: new Date(),
					updated_at: new Date(),
				})
				.returning();

			await db.update(notes).set({ updated_at: new Date() }).where(eq(notes.id, note.id));

			if (!insert[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create Message" });

			event.noteUpdateEmitter.emit("add_message", {
				kind: "add_message",
				note_id: note.id,
				message: insert[0] as Message,
			});

			createNotification(note.followers ?? [], {
				id: randomUUID(),
				timestamp: new Date(),
				topic: "New-Note-Message",
				title: `New Message on Note`,
				body: `A new message has been added by ${authorProfile[0].username}`,
				data: { page: "support/view/" + note.id, note_id: note.id },
			});

			if (event.slackTeam && note.slack_channel && note.slack_ts) {
				const messageTS = await sendSlackMessage(
					note.slack_channel,
					event.slackTeam,
					{
						blocks: [
							{
								type: "context",
								elements: [
									{ type: "plain_text", text: `From: ${insert[0].author?.username}`, emoji: true },
								],
							},
							{
								type: "rich_text",
								elements: [
									{ type: "rich_text_section", elements: [{ type: "text", text: insert[0].text }] },
								],
							},
						],
						username: insert[0].author?.username,
					},
					note.slack_ts,
				);
				await db
					.update(messages)
					.set({ slack_ts: messageTS, slack_channel: event.slackChannel })
					.where(eq(messages.id, insert[0].id))
					.execute();
			}

			return insert[0] as Message;
		}),

	edit: eventProcedure
		.input(
			z.object({
				note_id: z.string().uuid(),
				message_id: z.string().uuid(),
				new_text: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.eventToken as string);

			const note = await db.query.notes.findFirst({
				where: and(eq(notes.id, input.note_id), eq(notes.event_code, event.code)),
			});
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

			const message = await db.query.messages.findFirst({ where: eq(messages.id, input.message_id) });
			if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });

			const currentUserProfile = await db
				.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
				.from(users)
				.where(eq(users.token, ctx.token as string));
			if (!currentUserProfile[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Current User not found" });

			const update = await db
				.update(messages)
				.set({ text: input.new_text, updated_at: new Date() })
				.where(eq(messages.id, input.message_id))
				.returning();

			await db.update(notes).set({ updated_at: new Date() }).where(eq(notes.id, note.id));

			if (!update[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update Message" });

			event.noteUpdateEmitter.emit("edit_message", {
				kind: "edit_message",
				note_id: note.id,
				message: update[0] as Message,
			});

			if (event.slackTeam && message.slack_ts && note.slack_channel) {
				await updateSlackMessage(note.slack_channel, event.slackTeam, message.slack_ts, {
					blocks: [
						{
							type: "context",
							elements: [
								{ type: "plain_text", text: `From: ${update[0].author?.username}`, emoji: true },
							],
						},
						{
							type: "rich_text",
							elements: [
								{ type: "rich_text_section", elements: [{ type: "text", text: update[0].text }] },
							],
						},
					],
					username: update[0].author?.username,
				});
			}

			return update[0] as Message;
		}),

	delete: eventProcedure
		.input(
			z.object({
				note_id: z.string().uuid(),
				message_id: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.eventToken as string);

			const message = await db.query.messages.findFirst({ where: eq(messages.id, input.message_id) });
			if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });

			const currentUserProfile = await db
				.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
				.from(users)
				.where(eq(users.token, ctx.token as string));
			if (!currentUserProfile[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Current User not found" });

			const result = await db.delete(messages).where(eq(messages.id, input.message_id));
			if (!result) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to delete Message" });

			event.noteUpdateEmitter.emit("delete_message", {
				kind: "delete_message",
				note_id: input.note_id,
				message_id: message.id,
			});

			if (event.slackTeam && message.slack_ts && message.slack_channel) {
				await deleteSlackMessage(message.slack_channel, event.slackTeam, message.slack_ts);
			}

			return message.id;
		}),
});

// #region Notes

export const notesRouter = router({
	getAll: eventProcedure.query(async ({ ctx }) => {
		const event = await getEvent(ctx.eventToken as string);

		let eventCodes = [event.code];
		if (event.meshedEvent && event.subEvents) {
			eventCodes = eventCodes.concat(event.subEvents.map((se) => se.code));
		}

		const eventNotes = await db.query.notes.findMany({
			where: inArray(notes.event_code, eventCodes),
			orderBy: [asc(notes.created_at)],
		});
		if (!eventNotes) throw new TRPCError({ code: "NOT_FOUND", message: "Notes not found" });
		return eventNotes as Note[];
	}),

	getAllWithMessages: eventProcedure.query(async ({ ctx }) => {
		const event = await getEvent(ctx.eventToken as string);

		let eventCodes = [event.code];
		if (event.meshedEvent && event.subEvents) {
			eventCodes = eventCodes.concat(event.subEvents.map((se) => se.code));
		}

		const eventNotes = await db.query.notes.findMany({
			where: inArray(notes.event_code, eventCodes),
			orderBy: [asc(notes.created_at)],
			with: { messages: { orderBy: [asc(messages.id)] } },
		});
		if (!eventNotes) throw new TRPCError({ code: "NOT_FOUND", message: "Notes not found" });
		return eventNotes as Note[];
	}),

	getAllByWithMessages: eventProcedure
		.input(
			z.object({
				event_code: z.string(),
				author_id: z.number().optional(),
				team_number: z.number().optional(),
				assigned_to_id: z.number().optional(),
				is_open: z.boolean().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const query = [];

			if (input.event_code) {
				const event = await getEvent("", input.event_code);
				if (event.meshedEvent && event.subEvents) {
					query.push(inArray(notes.event_code, [event.code, ...event.subEvents.map((se) => se.code)]));
				} else {
					query.push(eq(notes.event_code, input.event_code));
				}
			}
			if (input.team_number) query.push(eq(notes.team, input.team_number));
			if (input.author_id) query.push(eq(notes.author_id, input.author_id));
			if (input.assigned_to_id) query.push(eq(notes.assigned_to_id, input.assigned_to_id));
			if (input.is_open !== undefined) {
				query.push(eq(notes.resolution_status, input.is_open ? "Open" : "Resolved"));
			}

			const results = await db.query.notes.findMany({
				where: and(...query),
				orderBy: [asc(notes.created_at)],
				with: { messages: { orderBy: [asc(messages.id)] } },
			});
			if (!results) throw new TRPCError({ code: "NOT_FOUND", message: "No Notes found" });
			return results as Note[];
		}),

	getAllByAuthor: eventProcedure.input(z.object({ author_id: z.number() })).query(async ({ ctx, input }) => {
		const notesByAuthor = await db.query.notes.findMany({
			where: eq(notes.author_id, input.author_id),
			orderBy: [asc(notes.created_at)],
		});
		if (!notesByAuthor) throw new TRPCError({ code: "NOT_FOUND", message: "No Notes found by provided user" });
		return notesByAuthor as Note[];
	}),

	getAllByTeam: eventProcedure.input(z.object({ team_number: z.number() })).query(async ({ ctx, input }) => {
		const notesByTeam = await db
			.select()
			.from(notes)
			.leftJoin(events, eq(notes.event_code, events.code))
			.where(and(eq(notes.team, input.team_number), eq(events.archived, false)))
			.orderBy(asc(notes.created_at));
		if (!notesByTeam) throw new TRPCError({ code: "NOT_FOUND", message: "No Notes found for provided team" });
		return notesByTeam.map((row) => row.notes) as Note[];
	}),

	getById: eventProcedure
		.input(z.object({ id: z.string().uuid(), event_code: z.string() }))
		.query(async ({ ctx, input }) => {
			const note = await db.query.notes.findFirst({
				where: and(eq(notes.id, input.id), eq(notes.event_code, input.event_code)),
			});
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
			return note as Note;
		}),

	getByIdWithMessages: eventProcedure
		.input(z.object({ id: z.string().uuid(), event_code: z.string() }))
		.query(async ({ ctx, input }) => {
			const event = await getEvent("", input.event_code);
			let eventCodes = [event.code];
			if (event.meshedEvent && event.subEvents) {
				eventCodes = eventCodes.concat(event.subEvents.map((se) => se.code));
			}
			const note = await db.query.notes.findFirst({
				where: and(eq(notes.id, input.id), inArray(notes.event_code, eventCodes)),
				with: { messages: { orderBy: [asc(messages.id)] } },
			});
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

			// Lazy back-fill: if the note has a match_number but no match_id, try to resolve it now
			if (note.match_number && !note.match_id) {
				const resolved = await resolveMatchId(
					note.event_code,
					note.match_number,
					note.play_number,
					note.tournament_level,
				);
				if (resolved) {
					await db.update(notes).set({ match_id: resolved }).where(eq(notes.id, note.id));
					(note as any).match_id = resolved;
				}
			}

			return note as Note;
		}),

	publicCreate: publicProcedure
		.input(
			z.object({
				event_code: z.string(),
				team: z.number(),
				text: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			const event = await getEvent("", input.event_code);

			const author = await db
				.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
				.from(users)
				.where(eq(users.id, -1));
			if (!author[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve author Profile" });

			if (!event.teams.find((t) => parseInt(t.number) === input.team)) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Provided Team number is not associated with this Event",
				});
			}

			if (!event.publicNoteSubmit) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Public Note submission is disabled for this Event",
				});
			}

			const noteId = randomUUID();
			const insert = await db
				.insert(notes)
				.values({
					id: noteId,
					team: input.team,
					text: input.text,
					author_id: author[0].id,
					author: author[0] as Profile,
					note_type: "TeamIssue",
					resolution_status: "Open",
					event_code: event.code,
					followers: [author[0].id],
					created_at: new Date(),
					updated_at: new Date(),
				})
				.returning();
			if (!insert[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create Note" });

			event.noteUpdateEmitter.emit("create", { kind: "create", note: insert[0] as Note });

			createNotification(
				event.users.map((u) => u.id),
				{
					id: randomUUID(),
					timestamp: new Date(),
					topic: "Note-Created",
					title: `New Note for Team #${insert[0].team}`,
					body: `New Note created by Team #${insert[0].team}`,
					data: { page: "support/view/" + insert[0].id, note_id: insert[0].id },
				},
			);

			if (event.slackChannel && event.slackTeam) {
				const messageTS = await sendSlackMessage(
					event.slackChannel,
					event.slackTeam,
					createSlackNoteMessage(
						insert[0].id,
						insert[0].team,
						"Team Submission",
						insert[0].text.substring(0, 60),
						insert[0].text,
					),
				);
				await db
					.update(notes)
					.set({ slack_ts: messageTS, slack_channel: event.slackChannel })
					.where(eq(notes.id, insert[0].id))
					.execute();
			}

			return insert[0] as Note;
		}),

	create: eventProcedure
		.input(
			z.object({
				team: z.number().nullable().optional(),
				text: z.string(),
				note_type: z.enum(["TeamIssue", "EventNote", "MatchNote"]).default("TeamIssue"),
				match_number: z.number().nullable().optional(),
				play_number: z.number().nullable().optional(),
				tournament_level: z.enum(["None", "Practice", "Qualification", "Playoff"]).nullable().optional(),
				issue_type: z.string().nullable().optional(),
				match_id: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.eventToken as string);

			const authorProfile = (await db
				.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
				.from(users)
				.where(eq(users.token, ctx.token as string))) as Profile[];
			if (!authorProfile[0])
				throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve author Profile" });

			const isTeamIssue = input.note_type === "TeamIssue";
			const resolutionStatus = isTeamIssue ? "Open" : "NotApplicable";
			const issueTypeVal = isTeamIssue ? (input.issue_type ?? null) : null;
			const fmsMetadata = input.issue_type
				? ({ issueType: input.issue_type, resolutionStatus: "Open" } as FmsNoteMetadata)
				: null;

			// Auto-resolve match_id from match_number when not explicitly provided
			const matchId =
				input.match_id ??
				(await resolveMatchId(event.code, input.match_number, input.play_number, input.tournament_level));

			const noteId = randomUUID();
			const insert = await db
				.insert(notes)
				.values({
					id: noteId,
					team: input.team ?? null,
					author_id: authorProfile[0].id,
					author: authorProfile[0],
					text: input.text,
					note_type: input.note_type,
					resolution_status: resolutionStatus as any,
					issue_type: issueTypeVal as any,
					match_number: input.match_number ?? null,
					play_number: input.play_number ?? null,
					tournament_level: input.tournament_level ?? null,
					fms_note_id: null,
					fms_record_version: null,
					fms_metadata: fmsMetadata,
					event_code: event.code,
					created_at: new Date(),
					updated_at: new Date(),
					followers: [authorProfile[0].id],
					match_id: matchId,
				})
				.returning();
			if (!insert[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create Note" });

			event.noteUpdateEmitter.emit("create", { kind: "create", note: insert[0] as Note });

			createNotification(
				event.users.map((u) => u.id),
				{
					id: randomUUID(),
					timestamp: new Date(),
					topic: "Note-Created",
					title: `New Note for Team #${insert[0].team}`,
					body: `New Note created by ${authorProfile[0].username}`,
					data: { page: "support/view/" + insert[0].id, note_id: insert[0].id },
				},
			);

			if (event.slackChannel && event.slackTeam) {
				const messageTS = await sendSlackMessage(
					event.slackChannel,
					event.slackTeam,
					createSlackNoteMessage(
						insert[0].id,
						insert[0].team,
						authorProfile[0].username,
						insert[0].text.substring(0, 60),
						insert[0].text,
						insert[0].match_id ?? undefined,
					),
				);
				await db
					.update(notes)
					.set({ slack_ts: messageTS, slack_channel: event.slackChannel })
					.where(eq(notes.id, insert[0].id))
					.execute();
			}

			return insert[0] as Note;
		}),

	edit: eventProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				new_text: z.string(),
				event_code: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.eventToken as string);

			const note = await db.query.notes.findFirst({
				where: and(eq(notes.id, input.id), eq(notes.event_code, input.event_code)),
			});
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

			if (!ctx.token) throw new TRPCError({ code: "BAD_REQUEST", message: "User token not provided" });
			const currentUserProfile = await db
				.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
				.from(users)
				.where(eq(users.token, ctx.token));
			if (!currentUserProfile[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Current User not found" });

			const update = await db
				.update(notes)
				.set({ text: input.new_text, updated_at: new Date() })
				.where(eq(notes.id, input.id))
				.returning();
			if (!update[0])
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update Note text" });

			event.noteUpdateEmitter.emit("edit", { kind: "edit", note: update[0] as Note });

			if (event.slackTeam && note.slack_ts && note.slack_channel) {
				await updateSlackMessage(
					note.slack_channel,
					event.slackTeam,
					note.slack_ts,
					createSlackNoteMessage(
						update[0].id,
						update[0].team,
						update[0].author?.username ?? "Unknown",
						update[0].text.substring(0, 60),
						update[0].text,
						update[0].match_id ?? undefined,
					),
				);
			}

			return update[0] as Note;
		}),

	delete: eventProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
		const event = await getEvent(ctx.eventToken as string);

		const note = await db.query.notes.findFirst({ where: eq(notes.id, input.id) });
		if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

		if (!ctx.token) throw new TRPCError({ code: "BAD_REQUEST", message: "User token not provided" });
		const currentUserProfile = await db
			.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
			.from(users)
			.where(eq(users.token, ctx.token));
		if (!currentUserProfile[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Current User not found" });

		await db.delete(messages).where(eq(messages.note_id, input.id));
		const result = await db.delete(notes).where(eq(notes.id, input.id));
		if (!result) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to delete Note" });

		event.noteUpdateEmitter.emit("delete", { kind: "delete", note: note as Note });

		if (event.slackTeam && note.slack_ts && note.slack_channel) {
			await deleteSlackMessage(note.slack_channel, event.slackTeam, note.slack_ts);
		}

		return note.id;
	}),

	updateStatus: eventProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				new_status: z.enum(["Open", "Resolved"]),
				event_code: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.eventToken as string);

			const note = await db.query.notes.findFirst({
				where: and(eq(notes.id, input.id), eq(notes.event_code, input.event_code)),
			});
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

			let currentUserProfile: Profile[] | undefined;
			if (ctx.token) {
				currentUserProfile = await db
					.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
					.from(users)
					.where(eq(users.token, ctx.token));
			} else {
				throw new TRPCError({ code: "BAD_REQUEST", message: "User token not provided" });
			}
			if (!currentUserProfile[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Current User not found" });

			const isResolving = input.new_status === "Resolved";

			const update = await db
				.update(notes)
				.set({
					resolution_status: input.new_status as any,
					closed_at: isResolving ? new Date() : null,
					fms_metadata: note.fms_metadata
						? { ...(note.fms_metadata as FmsNoteMetadata), resolutionStatus: input.new_status }
						: null,
					updated_at: new Date(),
				})
				.where(eq(notes.id, input.id))
				.returning();
			if (!update[0])
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update note status" });

			event.noteUpdateEmitter.emit("status", {
				kind: "status",
				note_id: update[0].id,
				resolution_status: update[0].resolution_status ?? "Open",
			});

			createNotification(note.followers ?? [], {
				id: randomUUID(),
				timestamp: new Date(),
				topic: "Note-Status",
				title: `Note Status Updated to ${input.new_status}`,
				body: `Note status updated by ${currentUserProfile[0].username} and is now ${input.new_status}`,
				data: { page: "support/view/" + update[0].id, note_id: update[0].id },
			});

			if (event.slackTeam && note.slack_ts && note.slack_channel) {
				if (isResolving) {
					await addSlackReaction(note.slack_channel, event.slackTeam, note.slack_ts, "white_check_mark");
				} else {
					await removeSlackReaction(note.slack_channel, event.slackTeam, note.slack_ts, "white_check_mark");
				}
			}

			return update[0] as Note;
		}),

	assign: eventProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				user_id: z.number(),
				event_code: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.eventToken as string);

			const note = await db.query.notes.findFirst({
				where: and(eq(notes.id, input.id), eq(notes.event_code, input.event_code)),
			});
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

			const profile = await db
				.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
				.from(users)
				.where(eq(users.id, input.user_id));
			if (!profile[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve User profile" });

			if (note.assigned_to_id === input.user_id) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "User is already assigned to this note" });
			}

			const update = await db
				.update(notes)
				.set({
					assigned_to_id: input.user_id,
					assigned_to: profile[0] as Profile,
					updated_at: new Date(),
				})
				.where(eq(notes.id, input.id))
				.returning();
			if (!update[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to assign User" });

			event.noteUpdateEmitter.emit("assign", {
				kind: "assign",
				note_id: update[0].id,
				assigned_to_id: update[0].assigned_to_id,
				assigned_to: profile[0] as Profile,
			});

			createNotification(
				(note.followers ?? []).filter((id) => id !== profile[0].id),
				{
					id: randomUUID(),
					timestamp: new Date(),
					topic: "Note-Assigned",
					title: `Note Has Been Assigned`,
					body: `Note assigned to ${profile[0].username}`,
					data: { page: "support/view/" + note.id, note_id: note.id },
				},
			);

			createNotification([profile[0].id], {
				id: randomUUID(),
				timestamp: new Date(),
				topic: "Note-Assigned",
				title: `A Note Has Been Assigned to You`,
				body: `Note assigned to you`,
				data: { page: "support/view/" + note.id, note_id: note.id },
			});

			if (event.slackTeam && note.slack_ts && note.slack_channel) {
				await addSlackReaction(note.slack_channel, event.slackTeam, note.slack_ts, "eyes");
			}

			return update[0] as Note;
		}),

	unAssign: eventProcedure
		.input(
			z.object({
				note_id: z.string().uuid(),
				event_code: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.eventToken as string);

			const note = await db.query.notes.findFirst({
				where: and(eq(notes.id, input.note_id), eq(notes.event_code, input.event_code)),
			});
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

			if (note.assigned_to_id === null) {
				throw new TRPCError({ code: "NOT_FOUND", message: "No user currently assigned to this Note" });
			}

			let profile: Profile[] | null = [];
			if (note.assigned_to === null && note.assigned_to_id) {
				profile = await db
					.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
					.from(users)
					.where(eq(users.id, note.assigned_to_id));
			} else if (note.assigned_to !== null) {
				profile.push(note.assigned_to as Profile);
			}
			if (!profile[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Unable to find assigned User" });

			const update = await db
				.update(notes)
				.set({ assigned_to_id: null, assigned_to: null, updated_at: new Date() })
				.where(eq(notes.id, input.note_id))
				.returning();
			if (!update[0])
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update assignment" });

			event.noteUpdateEmitter.emit("assign", {
				kind: "assign",
				note_id: update[0].id,
				assigned_to_id: update[0].assigned_to_id,
				assigned_to: null,
			});

			createNotification(note.followers ?? [], {
				id: randomUUID(),
				timestamp: new Date(),
				topic: "Note-Assigned",
				title: `Note Has Been Set to Unassigned`,
				body: `Note has been set to unassigned`,
				data: { page: "support/view/" + note.id, note_id: note.id },
			});

			createNotification([profile[0].id], {
				id: randomUUID(),
				timestamp: new Date(),
				topic: "Note-Assigned",
				title: `No Longer Assigned to Note`,
				body: `You are no longer assigned`,
				data: { page: "support/view/" + note.id, note_id: note.id },
			});

			if (event.slackTeam && note.slack_ts && note.slack_channel) {
				await removeSlackReaction(note.slack_channel, event.slackTeam, note.slack_ts, "eyes");
			}

			return update[0] as Note;
		}),

	follow: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				follow: z.boolean(),
				event_code: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.eventToken as string);

			const note = await db.query.notes.findFirst({
				where: and(eq(notes.id, input.id), eq(notes.event_code, input.event_code)),
			});
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

			const currentUserProfile = await db
				.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
				.from(users)
				.where(eq(users.token, ctx.token as string));
			if (!currentUserProfile[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Current User not found" });

			const followers = (note.followers ?? []) as number[];
			let updatedFollowers: number[] = [];
			let update: Note[] = [];

			if (!followers.includes(ctx.user.id) && input.follow === true) {
				followers.push(ctx.user.id);
				update = (await db
					.update(notes)
					.set({ followers })
					.where(eq(notes.id, input.id))
					.returning()) as Note[];
			} else if (!followers.includes(ctx.user.id) && input.follow === false) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Current User is not following this Note" });
			} else if (followers.includes(ctx.user.id) && input.follow === true) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Current User is already following this Note" });
			} else if (followers.includes(ctx.user.id) && input.follow === false) {
				updatedFollowers = followers.filter((id) => id !== ctx.user.id);
				update = (await db
					.update(notes)
					.set({ followers: updatedFollowers })
					.where(eq(notes.id, input.id))
					.returning()) as Note[];
			}

			if (!update || (Array.isArray(update) && update.length === 0)) {
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update Note followers" });
			}

			event.noteUpdateEmitter.emit("follow", {
				kind: "follow",
				note_id: update[0].id,
				followers: update[0].followers,
			});

			return update[0] as Note;
		}),

	attachMatchLog: eventProcedure
		.input(z.object({ matchId: z.string(), noteId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const note = await db.query.notes.findFirst({ where: eq(notes.id, input.noteId) });
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

			const event = await getEvent(ctx.eventToken as string);

			await db.update(notes).set({ match_id: input.matchId }).where(eq(notes.id, input.noteId));

			if (event.slackTeam && note.slack_ts && note.slack_channel) {
				await updateSlackMessage(
					note.slack_channel,
					event.slackTeam,
					note.slack_ts,
					createSlackNoteMessage(
						note.id,
						note.team,
						note.author?.username ?? "Unknown",
						note.text.substring(0, 60),
						note.text,
						input.matchId,
					),
				);
			}
		}),

	generateNotesReport: eventProcedure.query(async ({ ctx }) => {
		const event = await getEvent(ctx.eventToken as string);

		const totalAvgOpenTime = await getAllAvgOpenTime(event.code);
		const teamNumbers = event.teams.map((t) => parseInt(t.number));
		const allTeamsInfo = await getAllTeamNotesInfo(event.code, teamNumbers);

		const path = await generateReport(
			{
				title: `Notes Report for ${event.code}`,
				description: `Average Total Open Time: ${formatTimeShortNoAgoMinutes(totalAvgOpenTime)}`,
				headers: [
					"Team #",
					"Total Open Time",
					"# of Notes",
					"Avg Open Time",
					"Longest Open Time",
					"Longest Text",
					"All Texts",
					"All Note Links",
				],
				fileName: "NotesReport",
			},
			allTeamsInfo.map((info) => [
				info.team,
				formatTimeShortNoAgoMinutes(info.totalOpenTime) ?? "None",
				info.notes.length,
				(info.avgOpenTime !== null ? formatTimeShortNoAgoMinutes(info.avgOpenTime) : "None") ?? "None",
				formatTimeShortNoAgoMinutes(info.longestNoteOpenTime) ?? "None",
				info.longestNote !== null ? info.longestNote.text.substring(0, 80) : "",
				info.noteSubjects,
				info.noteLinks ?? "None",
			]),
			event.code,
		);

		return { path };
	}),

	createFromFMS: eventProcedure
		.input(
			z.object({
				team: z.number().nullable().optional(),
				text: z.string(),
				note_type: z.enum(["TeamIssue", "EventNote", "MatchNote"]),
				match_number: z.number().nullable().optional(),
				play_number: z.number().nullable().optional(),
				tournament_level: z.enum(["None", "Practice", "Qualification", "Playoff"]).nullable().optional(),
				fms_note_id: z.string(),
				fms_record_version: z.number().nullable().optional(),
				fms_metadata: z.object({ issueType: z.string(), resolutionStatus: z.string() }).nullable().optional(),
				display_name: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.eventToken as string);

			const author: Profile = {
				id: -1,
				username: input.display_name,
				role: "FTA",
				admin: false,
				source: "FMS",
			};

			const meta = input.fms_metadata as FmsNoteMetadata | null;
			const resStatus = meta?.resolutionStatus ?? (input.note_type === "TeamIssue" ? "Open" : "NotApplicable");
			const issueTypeVal = meta?.issueType ?? null;

			const insert = await db
				.insert(notes)
				.values({
					id: randomUUID(),
					team: input.team ?? null,
					text: input.text,
					author_id: -1,
					author,
					note_type: input.note_type,
					resolution_status: resStatus as any,
					issue_type: issueTypeVal as any,
					match_number: input.match_number ?? null,
					play_number: input.play_number ?? null,
					tournament_level: input.tournament_level ?? null,
					fms_note_id: input.fms_note_id,
					fms_record_version: input.fms_record_version ?? null,
					fms_metadata: (input.fms_metadata as FmsNoteMetadata) ?? null,
					event_code: event.code,
					created_at: new Date(),
					updated_at: new Date(),
				})
				.returning();
			if (!insert[0])
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create Note from FMS" });

			event.noteUpdateEmitter.emit("create", { kind: "create", note: insert[0] as Note, source: "fms" });
			return insert[0] as Note;
		}),

	editFromFMS: eventProcedure
		.input(
			z
				.object({
					id: z.string().uuid().optional(),
					fms_note_id: z.string().optional(),
					text: z.string(),
					fms_record_version: z.number().nullable().optional(),
					fms_metadata: z
						.object({ issueType: z.string(), resolutionStatus: z.string() })
						.nullable()
						.optional(),
				})
				.refine((d) => d.id !== undefined || d.fms_note_id !== undefined, {
					message: "Either id or fms_note_id must be provided",
				}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.eventToken as string);

			const whereClause = input.id
				? and(eq(notes.id, input.id), eq(notes.event_code, event.code))
				: and(eq(notes.fms_note_id, input.fms_note_id!), eq(notes.event_code, event.code));

			const note = await db.query.notes.findFirst({ where: whereClause });
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

			const editMeta = input.fms_metadata as FmsNoteMetadata | null;
			const editResStatus = editMeta?.resolutionStatus ?? null;
			const editIssueType = editMeta?.issueType ?? null;
			const isResolving = editResStatus === "Resolved";

			const update = await db
				.update(notes)
				.set({
					text: input.text,
					fms_record_version: input.fms_record_version ?? null,
					fms_metadata: (input.fms_metadata as FmsNoteMetadata) ?? null,
					resolution_status: editResStatus as any,
					issue_type: editIssueType as any,
					closed_at: isResolving ? new Date() : null,
					updated_at: new Date(),
				})
				.where(eq(notes.id, note.id))
				.returning();
			if (!update[0])
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update Note from FMS" });

			event.noteUpdateEmitter.emit("edit", { kind: "edit", note: update[0] as Note, source: "fms" });
			return update[0] as Note;
		}),

	setFmsId: eventProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				fms_note_id: z.string(),
				fms_record_version: z.number().nullable().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.eventToken as string);
			const update = await db
				.update(notes)
				.set({
					fms_note_id: input.fms_note_id,
					fms_record_version: input.fms_record_version ?? null,
					updated_at: new Date(),
				})
				.where(and(eq(notes.id, input.id), eq(notes.event_code, event.code)))
				.returning();
			if (!update[0])
				throw new TRPCError({ code: "NOT_FOUND", message: "Note not found or does not belong to this event" });
			return update[0] as Note;
		}),

	getByFmsNoteId: eventProcedure.input(z.object({ fms_note_id: z.string() })).query(async ({ ctx, input }) => {
		const event = await getEvent(ctx.eventToken as string);
		const note = await db.query.notes.findFirst({
			where: and(eq(notes.fms_note_id, input.fms_note_id), eq(notes.event_code, event.code)),
		});
		if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found for given FMS note ID" });
		return note as Note;
	}),

	deleteByFmsNoteId: eventProcedure.input(z.object({ fms_note_id: z.string() })).mutation(async ({ ctx, input }) => {
		const event = await getEvent(ctx.eventToken as string);
		const note = await db.query.notes.findFirst({
			where: and(eq(notes.fms_note_id, input.fms_note_id), eq(notes.event_code, event.code)),
		});
		if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found for given FMS note ID" });
		await db.delete(messages).where(eq(messages.note_id, note.id));
		await db.delete(notes).where(eq(notes.id, note.id));
		event.noteUpdateEmitter.emit("delete", { kind: "delete", note: note as Note, source: "fms" });
		return note.id;
	}),

	messages: messagesSubRouter,

	updateSubscription: publicProcedure
		.input(
			z.object({
				eventToken: z.string(),
				note_id: z.string().uuid().optional(),
				eventOptions: z
					.object({
						create: z.boolean().optional(),
						edit: z.boolean().optional(),
						delete: z.boolean().optional(),
						status: z.boolean().optional(),
						assign: z.boolean().optional(),
						follow: z.boolean().optional(),
						add_message: z.boolean().optional(),
						edit_message: z.boolean().optional(),
						delete_message: z.boolean().optional(),
					})
					.optional(),
			}),
		)
		.subscription(async function* ({ input, signal }) {
			const event = await getEvent(input.eventToken);

			const { push, drain } = subscriptionQueue<NoteUpdateEventData>(signal!);

			// Build filtered push helper for note_id filtering
			function filteredPush<K extends NoteUpdateEventData["kind"]>(
				data: Extract<NoteUpdateEventData, { kind: K }>,
			) {
				if (!input.note_id) {
					push(data);
					return;
				}
				// Filter by note_id for applicable kinds
				if ("note" in data && data.note.id === input.note_id) {
					push(data);
				} else if ("note_id" in data && data.note_id === input.note_id) {
					push(data);
				}
			}

			const handlers: { event: keyof NoteUpdateEvents; fn: (...args: any[]) => void }[] = [];

			function registerHandler<K extends keyof NoteUpdateEvents>(eventName: K, handler: NoteUpdateEvents[K]) {
				handlers.push({ event: eventName, fn: handler as any });
				event.noteUpdateEmitter.on(eventName, handler);
			}

			const opts = input.eventOptions ?? {
				create: true,
				edit: true,
				delete: true,
				status: true,
				assign: true,
				follow: true,
				add_message: true,
				edit_message: true,
				delete_message: true,
			};

			if (opts.create !== false) registerHandler("create", (data) => filteredPush(data));
			if (opts.edit !== false) registerHandler("edit", (data) => filteredPush(data));
			if (opts.delete !== false) registerHandler("delete", (data) => filteredPush(data));
			if (opts.status !== false) registerHandler("status", (data) => filteredPush(data));
			if (opts.assign !== false) registerHandler("assign", (data) => filteredPush(data));
			if (opts.follow !== false) registerHandler("follow", (data) => filteredPush(data));
			if (opts.add_message !== false) registerHandler("add_message", (data) => filteredPush(data));
			if (opts.edit_message !== false) registerHandler("edit_message", (data) => filteredPush(data));
			if (opts.delete_message !== false) registerHandler("delete_message", (data) => filteredPush(data));

			try {
				yield* drain();
			} finally {
				for (const h of handlers) {
					event.noteUpdateEmitter.off(h.event, h.fn as any);
				}
			}
		}),

	pushSubscription: publicProcedure.input(z.object({ token: z.string() })).subscription(async function* ({
		input,
		signal,
	}) {
		const user = await db.query.users.findFirst({ where: eq(users.token, input.token) });
		if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

		for await (const [payload] of on(notificationEmitter, "send", { signal: signal! })) {
			const d = payload as { users: number[]; notification: Notification };
			if (d.users.includes(user.id)) {
				yield d.notification;
			}
		}
	}),

	registerPush: protectedProcedure
		.input(
			z.object({
				endpoint: z.string(),
				expirationTime: z.date(),
				keys: z.object({ p256dh: z.string(), auth: z.string() }),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			db.insert(pushSubscriptions)
				.values({
					endpoint: input.endpoint,
					expirationTime: input.expirationTime,
					keys: input.keys,
					user_id: ctx.user.id,
				})
				.execute();
			return true;
		}),
});

export async function getEventNotes(event_code: string) {
	const eventNotes = await db.query.notes.findMany({
		where: eq(notes.event_code, event_code),
		orderBy: [desc(notes.team)],
	});
	if (!eventNotes) throw new TRPCError({ code: "NOT_FOUND", message: "Unable to find notes for this event" });
	return eventNotes as Note[];
}

export async function getEventMessages(event_code: string) {
	const eventMessages = await db.query.messages.findMany({
		where: eq(messages.event_code, event_code),
		orderBy: [asc(messages.created_at)],
	});
	if (!eventMessages) throw new TRPCError({ code: "NOT_FOUND", message: "Unable to find Messages for this event" });
	return eventMessages;
}

export async function updateNoteStatusFromSlack(message_ts: string, resolved: boolean) {
	const note = await db.query.notes.findFirst({ where: eq(notes.slack_ts, message_ts) });
	if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

	const newStatus = resolved ? "Resolved" : "Open";
	const update = await db
		.update(notes)
		.set({
			resolution_status: newStatus as any,
			closed_at: resolved ? new Date() : null,
			updated_at: new Date(),
		})
		.where(eq(notes.id, note.id))
		.returning();

	const event = await getEvent("", note.event_code);

	event.noteUpdateEmitter.emit("status", {
		kind: "status",
		note_id: update[0].id,
		resolution_status: update[0].resolution_status ?? "Open",
	});

	createNotification(note.followers ?? [], {
		id: randomUUID(),
		timestamp: new Date(),
		topic: "Note-Status",
		title: `Note Status Updated to ${newStatus}`,
		body: `Note status updated and is now ${newStatus}`,
		data: { page: "support/view/" + update[0].id, note_id: update[0].id },
	});

	if (!resolved && note.slack_channel && event.slackTeam && note.slack_ts) {
		removeSlackReaction(note.slack_channel, event.slackTeam, note.slack_ts, "white_check_mark");
	}

	return update[0] as Note;
}

export async function updateNoteAssignmentFromSlack(message_ts: string, add: boolean, slackUser: string) {
	const note = await db.query.notes.findFirst({ where: eq(notes.slack_ts, message_ts) });
	if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

	const profile: Profile = { id: -1, role: "CSA", admin: false, username: "Slack User" };

	const update = await db
		.update(notes)
		.set({
			assigned_to_id: add ? profile.id : null,
			assigned_to: add ? profile : null,
			updated_at: new Date(),
		})
		.where(eq(notes.id, note.id))
		.returning();

	const event = await getEvent("", note.event_code);

	if (add) {
		event.noteUpdateEmitter.emit("assign", {
			kind: "assign",
			note_id: update[0].id,
			assigned_to_id: update[0].assigned_to_id,
			assigned_to: profile,
		});
		createNotification(note.followers ?? [], {
			id: randomUUID(),
			timestamp: new Date(),
			topic: "Note-Assigned",
			title: `Note Has Been Assigned`,
			body: `Note assigned to ${profile.username}`,
			data: { page: "support/view/" + note.id, note_id: note.id },
		});
	} else {
		event.noteUpdateEmitter.emit("assign", {
			kind: "assign",
			note_id: update[0].id,
			assigned_to_id: update[0].assigned_to_id,
			assigned_to: null,
		});
		createNotification(note.followers ?? [], {
			id: randomUUID(),
			timestamp: new Date(),
			topic: "Note-Assigned",
			title: `Note Has Been Set to Unassigned`,
			body: `Note has been set to unassigned`,
			data: { page: "support/view/" + note.id, note_id: note.id },
		});
		if (note.slack_channel && event.slackTeam && note.slack_ts) {
			removeSlackReaction(note.slack_channel, event.slackTeam, note.slack_ts, "eyes");
		}
	}

	return update[0] as Note;
}

export async function addNoteMessageFromSlack(
	channel_id: string,
	message_ts: string,
	thread_ts: string,
	text: string,
	author_id: string,
) {
	const note = await db.query.notes.findFirst({ where: eq(notes.slack_ts, thread_ts) });
	if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

	const user: Profile = { id: -1, role: "CSA", admin: false, username: "Slack User", source: "Slack" };

	const insert = await db
		.insert(messages)
		.values({
			id: randomUUID(),
			note_id: note.id,
			author_id: user.id,
			author: user,
			text,
			event_code: note.event_code,
			created_at: new Date(),
			updated_at: new Date(),
			slack_ts: message_ts,
			slack_channel: channel_id,
		})
		.returning();

	const event = await getEvent("", note.event_code);

	event.noteUpdateEmitter.emit("add_message", {
		kind: "add_message",
		note_id: note.id,
		message: insert[0] as Message,
	});

	createNotification(note.followers ?? [], {
		id: randomUUID(),
		timestamp: new Date(),
		topic: "New-Note-Message",
		title: `New Message on Note`,
		body: `A new message has been added by ${user.username}`,
		data: { page: "support/view/" + note.id, note_id: note.id },
	});
}
