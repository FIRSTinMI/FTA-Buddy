import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { formatTimeShortNoAgoMinutes } from "../../shared/formatTime";
import { buildNotification, toNoteCtx } from "../../shared/notifications";
import type { Notification } from "../../shared/types";
import type { FmsNoteMetadata, Message, Note, NoteUpdateEventData, Profile } from "../../shared/types";
import { db } from "../db/db";
import schema, {
	events,
	matchEvents,
	matchLogs,
	messages,
	noteFollowers,
	notes,
	pushSubscriptions,
	users,
} from "../db/schema";
import { eventProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { getEvent } from "../util/get-event";
import { createNotification } from "../util/push-notifications";
import { generateReport } from "../util/report-generator";
import { generateNotesReportPdf } from "../util/notes-report-generator";
import {
	addSlackReaction,
	deleteSlackMessage,
	fetchSlackMessage,
	fetchSlackMessageReactions,
	fetchSlackThreadReplies,
	removeSlackReaction,
	resolveSlackMentions,
	resolveSlackUserProfile,
	sendSlackMessage,
	updateSlackMessage,
} from "../util/slack";
import { subscriptionQueue } from "../util/subscription";
import { bus } from "../util/eventBus";
import { autoLinkEventsToNote } from "../util/auto-link-events";

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
	const total = eventNotes.reduce((sum: number, n) => {
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
	const noteLinks = teamNotes.map((n) => `https://ftabuddy.com/notepad/view/${event_code}/${n.id}`).join(", ");
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

async function getNoteFollowers(noteId: string): Promise<number[]> {
	const rows = await db
		.select({ user_id: noteFollowers.user_id })
		.from(noteFollowers)
		.where(eq(noteFollowers.note_id, noteId));
	return rows.map((r) => r.user_id);
}

async function attachFollowers<T extends { id: string }>(noteList: T[]): Promise<(T & { followers: number[] })[]> {
	if (noteList.length === 0) return noteList.map((n) => ({ ...n, followers: [] }));
	const rows = await db
		.select({ note_id: noteFollowers.note_id, user_id: noteFollowers.user_id })
		.from(noteFollowers)
		.where(
			inArray(
				noteFollowers.note_id,
				noteList.map((n) => n.id),
			),
		);
	const map = new Map<string, number[]>();
	for (const row of rows) {
		if (!map.has(row.note_id)) map.set(row.note_id, []);
		map.get(row.note_id)!.push(row.user_id);
	}
	return noteList.map((n) => ({ ...n, followers: map.get(n.id) ?? [] }));
}

// #region Slack Integration

type SlackElements = {
	type: string;
	text?:
		| string
		| {
				type: string;
				text: string;
				style?: { bold?: boolean };
				emoji?: boolean;
		  };
	url?: string;
	style?: { bold?: boolean };
	emoji?: boolean;
	elements?: SlackElements[];
};

export function createSlackNoteMessage(
	note_id: string,
	team_number: number | null,
	team_name: string | null,
	author: string,
	body: string,
	event_code: string,
	match_id?: string,
	event_token?: string,
) {
	const tokenParam = event_token ? `?token=${event_token}` : "";
	const noteUrl = `https://ftabuddy.com/notepad/view/${event_code}/${note_id}${tokenParam}`;
	const buttons: any[] = [];
	buttons.push({
		type: "button",
		text: { type: "plain_text", text: "View Note", emoji: true },
		url: noteUrl,
	});
	if (match_id) {
		buttons.push({
			type: "button",
			text: { type: "plain_text", text: "View Match Log", emoji: true },
			url: `https://ftabuddy.com/logs/event/${event_code}/${match_id}${tokenParam}`,
		});
	}
	const blocks: SlackElements[] = [
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
	];

	if (team_name) {
		blocks.push({
			type: "rich_text",
			elements: [
				{
					type: "rich_text_section",
					elements: [{ type: "text", text: team_name, style: { bold: true } }],
				},
			],
		});
	}

	blocks.push({
		type: "rich_text",
		elements: [
			{
				type: "rich_text_section",
				elements: [{ type: "text", text: body }],
			},
		],
	});

	blocks.push({
		type: "rich_text",
		elements: [
			{
				type: "rich_text_section",
				elements: [{ type: "link", url: noteUrl, text: "View in FTA Buddy" }],
			},
		],
	});

	blocks.push({
		type: "actions",
		elements: buttons,
	});

	return {
		blocks,
		unfurl_links: false,
		unfurl_media: false,
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
			const event = ctx.event;

			const note = await db.query.notes.findFirst({
				where: and(eq(notes.id, input.note_id), eq(notes.event_code, input.event_code)),
			});
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

			const localProfile: Profile = { id: -1, username: "Field", role: "FTA", admin: false };
			let resolvedProfile: Profile;
			if (!ctx.token) {
				resolvedProfile = localProfile;
			} else {
				const rows = (await db
					.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
					.from(users)
					.where(eq(users.token, ctx.token))) as Profile[];
				if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve author Profile" });
				resolvedProfile = rows[0];
			}

			const insert = await db
				.insert(messages)
				.values({
					id: randomUUID(),
					note_id: note.id,
					author_id: resolvedProfile.id,
					author: resolvedProfile,
					text: input.text,
					event_code: note.event_code,
					created_at: new Date(),
					updated_at: new Date(),
				})
				.returning();

			await db.update(notes).set({ updated_at: new Date() }).where(eq(notes.id, note.id));

			if (!insert[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create Message" });

			bus.publish(`event:${note.event_code}:note_update`, {
				kind: "add_message",
				note_id: note.id,
				message: insert[0] as Message,
			});

			const msgFollowers = await getNoteFollowers(note.id);
			createNotification(
				msgFollowers.filter((id: number) => id !== resolvedProfile.id),
				buildNotification({
					kind: "note.message",
					eventCode: note.event_code,
					note: toNoteCtx(note as any),
					author: resolvedProfile.username,
					messageText: insert[0].text,
					messageId: insert[0].id,
				}),
				note.event_code,
			);

			const noteEvent = note.event_code !== event.code ? await getEvent("", note.event_code) : event;

			if (noteEvent.slackTeam && note.slack_channel && note.slack_ts) {
				const messageTS = await sendSlackMessage(
					note.slack_channel,
					noteEvent.slackTeam,
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
					.set({ slack_ts: messageTS, slack_channel: noteEvent.slackChannel })
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
				event_code: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = ctx.event;
			const noteEventCode = input.event_code ?? event.code;

			const note = await db.query.notes.findFirst({
				where: and(eq(notes.id, input.note_id), eq(notes.event_code, noteEventCode)),
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

			bus.publish(`event:${note.event_code}:note_update`, {
				kind: "edit_message",
				note_id: note.id,
				message: update[0] as Message,
			});

			const editNoteEvent = note.event_code !== event.code ? await getEvent("", note.event_code) : event;
			if (editNoteEvent.slackTeam && message.slack_ts && note.slack_channel) {
				await updateSlackMessage(note.slack_channel, editNoteEvent.slackTeam, message.slack_ts, {
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
				event_code: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = ctx.event;
			const deleteNoteEventCode = input.event_code ?? event.code;

			const note = await db.query.notes.findFirst({
				where: and(eq(notes.id, input.note_id), eq(notes.event_code, deleteNoteEventCode)),
			});
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

			const message = await db.query.messages.findFirst({
				where: and(eq(messages.id, input.message_id), eq(messages.note_id, input.note_id)),
			});
			if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });

			const currentUserProfile = await db
				.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
				.from(users)
				.where(eq(users.token, ctx.token as string));
			if (!currentUserProfile[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Current User not found" });

			const result = await db.delete(messages).where(eq(messages.id, input.message_id));
			if (!result) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to delete Message" });

			bus.publish(`event:${deleteNoteEventCode}:note_update`, {
				kind: "delete_message",
				note_id: input.note_id,
				message_id: message.id,
			});

			const deleteNoteEvent =
				deleteNoteEventCode !== event.code ? await getEvent("", deleteNoteEventCode) : event;
			if (deleteNoteEvent.slackTeam && message.slack_ts && message.slack_channel) {
				await deleteSlackMessage(message.slack_channel, deleteNoteEvent.slackTeam, message.slack_ts);
			}

			return message.id;
		}),
});

// #region Notes

export const notesRouter = router({
	getAll: eventProcedure.query(async ({ ctx }) => {
		const event = ctx.event;

		let eventCodes = [event.code];
		if (event.meshedEvent && event.subEvents && !event.playoffMode) {
			eventCodes = eventCodes.concat(event.subEvents.map((se) => se.code));
		}

		const eventNotes = await db.query.notes.findMany({
			where: inArray(notes.event_code, eventCodes),
			orderBy: [desc(notes.updated_at)],
		});
		if (!eventNotes) throw new TRPCError({ code: "NOT_FOUND", message: "Notes not found" });
		return (await attachFollowers(eventNotes)) as Note[];
	}),

	getAllWithMessages: eventProcedure.query(async ({ ctx }) => {
		const event = ctx.event;

		let eventCodes = [event.code];
		if (event.meshedEvent && event.subEvents && !event.playoffMode) {
			eventCodes = eventCodes.concat(event.subEvents.map((se) => se.code));
		}

		const eventNotes = await db.query.notes.findMany({
			where: inArray(notes.event_code, eventCodes),
			orderBy: [desc(notes.updated_at)],
			with: { messages: { orderBy: [asc(messages.id)] } },
		});
		if (!eventNotes) throw new TRPCError({ code: "NOT_FOUND", message: "Notes not found" });
		return (await attachFollowers(eventNotes)) as Note[];
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
				if (event.meshedEvent && event.subEvents && !event.playoffMode) {
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
				orderBy: [desc(notes.updated_at)],
				with: { messages: { orderBy: [asc(messages.id)] } },
			});
			if (!results) throw new TRPCError({ code: "NOT_FOUND", message: "No Notes found" });
			return (await attachFollowers(results)) as unknown as Note[];
		}),

	getAllByAuthor: eventProcedure.input(z.object({ author_id: z.number() })).query(async ({ ctx, input }) => {
		const notesByAuthor = await db.query.notes.findMany({
			where: eq(notes.author_id, input.author_id),
			orderBy: [desc(notes.updated_at)],
		});
		if (!notesByAuthor) throw new TRPCError({ code: "NOT_FOUND", message: "No Notes found by provided user" });
		return (await attachFollowers(notesByAuthor)) as Note[];
	}),

	getAllByTeam: eventProcedure.input(z.object({ team_number: z.number() })).query(async ({ ctx, input }) => {
		const notesByTeam = await db
			.select({
				notes,
				matchLogMatchNumber: matchLogs.match_number,
				matchLogPlayNumber: matchLogs.play_number,
				matchLogLevel: matchLogs.level,
			})
			.from(notes)
			.leftJoin(events, eq(notes.event_code, events.code))
			.leftJoin(matchLogs, eq(notes.match_id, matchLogs.id))
			.where(and(eq(notes.team, input.team_number), eq(events.archived, false)))
			.orderBy(desc(notes.updated_at));
		if (!notesByTeam) throw new TRPCError({ code: "NOT_FOUND", message: "No Notes found for provided team" });
		// When a note has a match_id, prefer the match log's authoritative match details
		// to keep NoteCard in team history consistent with the ViewNote badge (which also
		// looks up match details via match_id).
		const mappedNotes = notesByTeam.map((row: (typeof notesByTeam)[number]) => ({
			...row.notes,
			match_number: row.matchLogMatchNumber ?? row.notes.match_number,
			play_number: row.matchLogPlayNumber ?? row.notes.play_number,
			tournament_level: (row.matchLogLevel ?? row.notes.tournament_level) as Note["tournament_level"],
		}));
		return (await attachFollowers(mappedNotes)) as Note[];
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
			if (event.meshedEvent && event.subEvents && !event.playoffMode) {
				eventCodes = eventCodes.concat(event.subEvents.map((se) => se.code));
			}
			const note = await db.query.notes.findFirst({
				where: eq(notes.id, input.id),
				with: { messages: { orderBy: [asc(messages.id)] } },
			});
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

			// If this note was merged into another, follow the redirect chain
			if (note.merged_into) {
				let targetId = note.merged_into;
				// Follow up to 10 hops (in case of chained merges)
				for (let i = 0; i < 10; i++) {
					const target = await db.query.notes.findFirst({
						where: eq(notes.id, targetId),
						columns: { id: true, merged_into: true },
					});
					if (!target) break;
					if (!target.merged_into) break;
					targetId = target.merged_into;
				}
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: targetId,
				});
			}

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

			const noteFollowerIds = await getNoteFollowers(note.id);
			return { ...note, followers: noteFollowerIds } as Note;
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

			const teamInEvent = await db
				.select({ teamNumber: schema.checklist.teamNumber })
				.from(schema.checklist)
				.where(
					and(
						eq(schema.checklist.eventCode, event.code),
						eq(schema.checklist.teamNumber, String(input.team)),
					),
				)
				.limit(1);
			if (teamInEvent.length === 0) {
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
					created_at: new Date(),
					updated_at: new Date(),
				})
				.returning();
			if (!insert[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create Note" });

			const publicNoteResult = { ...insert[0], followers: [] as number[] } as Note;
			bus.publish(`event:${event.code}:note_update`, { kind: "create", note: publicNoteResult });

			createNotification(
				event.users.map((u) => u.id),
				buildNotification({
					kind: "note.created",
					eventCode: event.code,
					note: toNoteCtx(insert[0] as any),
					author: `Team #${insert[0].team}`,
				}),
				event.code,
			);

			if (event.slackChannel && event.slackTeam) {
				const messageTS = await sendSlackMessage(
					event.slackChannel,
					event.slackTeam,
					createSlackNoteMessage(
						insert[0].id,
						insert[0].team,
						insert[0].team !== null
							? ((
									await db
										.select({ name: schema.teams.name })
										.from(schema.teams)
										.where(eq(schema.teams.number, String(insert[0].team)))
										.limit(1)
								)[0]?.name ?? null)
							: null,
						"Team Submission",
						insert[0].text,
						event.code,
						undefined,
						event.token,
					),
				);
				await db
					.update(notes)
					.set({ slack_ts: messageTS, slack_channel: event.slackChannel })
					.where(eq(notes.id, insert[0].id))
					.execute();
			}

			return publicNoteResult;
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
				request_type: z.enum(["CSA", "RI"]).nullable().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = ctx.event;

			const localProfile: Profile = { id: -1, username: "Field", role: "FTA", admin: false };
			let resolvedProfile: Profile;
			if (!ctx.token) {
				resolvedProfile = localProfile;
			} else {
				const rows = (await db
					.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
					.from(users)
					.where(eq(users.token, ctx.token))) as Profile[];
				if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve author Profile" });
				resolvedProfile = rows[0];
			}

			const isTeamIssue = input.note_type === "TeamIssue";
			const hasRequest = !!input.request_type;
			const resolutionStatus = isTeamIssue ? (hasRequest ? "Open" : "Resolved") : "NotApplicable";
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
					author_id: resolvedProfile.id,
					author: resolvedProfile,
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
					closed_at: isTeamIssue && !hasRequest ? new Date() : null,
					match_id: matchId,
					request_type: input.request_type ?? null,
				})
				.returning();
			if (!insert[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create Note" });

			if (resolvedProfile.id > 0) {
				await db
					.insert(noteFollowers)
					.values({ note_id: noteId, user_id: resolvedProfile.id })
					.onConflictDoNothing();
			}
			const createNoteResult = {
				...insert[0],
				followers: resolvedProfile.id > 0 ? [resolvedProfile.id] : [],
			} as Note;

			bus.publish(`event:${event.code}:note_update`, { kind: "create", note: createNoteResult });

			// Auto-attach all active match events for the same team + match
			if (input.note_type === "TeamIssue" && insert[0].team !== null && insert[0].match_number !== null) {
				// Prefer matching on match_id for precision; fall back to match_number + play_number + tournament_level
				const matchEventFilters = [
					eq(matchEvents.event_code, event.code),
					eq(matchEvents.team, insert[0].team),
					eq(matchEvents.status, "active"),
				];
				if (insert[0].match_id !== null) {
					matchEventFilters.push(eq(matchEvents.match_id, insert[0].match_id));
				} else {
					matchEventFilters.push(eq(matchEvents.match_number, insert[0].match_number));
					if (insert[0].play_number !== null) {
						matchEventFilters.push(eq(matchEvents.play_number, insert[0].play_number));
					}
					if (insert[0].tournament_level !== null) {
						matchEventFilters.push(eq(matchEvents.level, insert[0].tournament_level));
					}
				}
				const activeEvents = await db
					.select()
					.from(matchEvents)
					.where(and(...matchEventFilters))
					.execute();

				await autoLinkEventsToNote(noteId, activeEvents, event);

				// If the note had no match_id yet but the linked events share a single match_id,
				// back-fill it so the Slack message below includes the "View Match Log" button
				if (insert[0].match_id === null && activeEvents.length > 0) {
					const uniqueMatchIds = [
						...new Set(activeEvents.map((e: (typeof activeEvents)[number]) => e.match_id).filter(Boolean)),
					];
					if (uniqueMatchIds.length === 1) {
						const resolvedMatchId = uniqueMatchIds[0];
						await db.update(notes).set({ match_id: resolvedMatchId }).where(eq(notes.id, noteId)).execute();
						(insert[0] as any).match_id = resolvedMatchId;
					}
				}
			}

			createNotification(
				event.users.map((u) => u.id).filter((id) => id !== resolvedProfile.id),
				buildNotification({
					kind: "note.created",
					eventCode: event.code,
					note: toNoteCtx(insert[0] as any),
					author: resolvedProfile.username,
				}),
				event.code,
			);

			if (event.slackChannel && event.slackTeam && insert[0].request_type !== null) {
				const messageTS = await sendSlackMessage(
					event.slackChannel,
					event.slackTeam,
					createSlackNoteMessage(
						insert[0].id,
						insert[0].team,
						insert[0].team !== null
							? ((
									await db
										.select({ name: schema.teams.name })
										.from(schema.teams)
										.where(eq(schema.teams.number, String(insert[0].team)))
										.limit(1)
								)[0]?.name ?? null)
							: null,
						resolvedProfile.username,
						insert[0].text,
						event.code,
						insert[0].match_id ?? undefined,
						event.token,
					),
				);
				await db
					.update(notes)
					.set({ slack_ts: messageTS, slack_channel: event.slackChannel })
					.where(eq(notes.id, insert[0].id))
					.execute();
			}

			return createNoteResult;
		}),

	edit: eventProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				new_text: z.string(),
				event_code: z.string(),
				match_id: z.string().optional(),
				request_type: z.enum(["CSA", "RI"]).nullable().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = ctx.event;

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

			const setFields: Record<string, any> = { text: input.new_text, updated_at: new Date() };
			if (input.match_id !== undefined) setFields.match_id = input.match_id;
			if (input.request_type !== undefined) setFields.request_type = input.request_type;

			const update = await db.update(notes).set(setFields).where(eq(notes.id, input.id)).returning();
			if (!update[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update Note" });

			const editFollowers = await getNoteFollowers(update[0].id);
			bus.publish(`event:${event.code}:note_update`, {
				kind: "edit",
				note: { ...update[0], followers: editFollowers } as Note,
			});

			const newRequestType = input.request_type !== undefined ? input.request_type : note.request_type;
			const slackMsg = createSlackNoteMessage(
				update[0].id,
				update[0].team,
				update[0].team !== null
					? ((
							await db
								.select({ name: schema.teams.name })
								.from(schema.teams)
								.where(eq(schema.teams.number, String(update[0].team)))
								.limit(1)
						)[0]?.name ?? null)
					: null,
				update[0].author?.username ?? "Unknown",
				update[0].text,
				event.code,
				update[0].match_id ?? undefined,
				event.token,
			);
			if (event.slackTeam && event.slackChannel) {
				if (newRequestType !== null && note.slack_ts && note.slack_channel) {
					await updateSlackMessage(note.slack_channel, event.slackTeam, note.slack_ts, slackMsg);
				} else if (newRequestType !== null && !note.slack_ts) {
					const messageTS = await sendSlackMessage(event.slackChannel, event.slackTeam, slackMsg);
					await db
						.update(notes)
						.set({ slack_ts: messageTS, slack_channel: event.slackChannel })
						.where(eq(notes.id, input.id))
						.execute();
				} else if (newRequestType === null && note.slack_ts && note.slack_channel) {
					await deleteSlackMessage(note.slack_channel, event.slackTeam, note.slack_ts);
					await db
						.update(notes)
						.set({ slack_ts: null, slack_channel: null })
						.where(eq(notes.id, input.id))
						.execute();
				}
			}

			return { ...update[0], followers: editFollowers } as Note;
		}),

	delete: eventProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
		const event = ctx.event;

		const note = await db.query.notes.findFirst({ where: eq(notes.id, input.id) });
		if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

		if (!ctx.token) throw new TRPCError({ code: "BAD_REQUEST", message: "User token not provided" });
		const currentUserProfile = await db
			.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
			.from(users)
			.where(eq(users.token, ctx.token));
		if (!currentUserProfile[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Current User not found" });

		await db.delete(messages).where(eq(messages.note_id, input.id));
		await db
			.update(matchEvents)
			.set({ converted_note_id: null, status: "active" })
			.where(eq(matchEvents.converted_note_id, input.id));
		const result = await db.delete(notes).where(eq(notes.id, input.id));
		if (!result) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to delete Note" });

		bus.publish(`event:${event.code}:note_update`, { kind: "delete", note: note as Note });

		if (event.slackTeam && note.slack_ts && note.slack_channel) {
			await deleteSlackMessage(note.slack_channel, event.slackTeam, note.slack_ts);
		}

		return note.id;
	}),

	merge: eventProcedure
		.input(
			z.object({
				source_id: z.string().uuid(),
				target_id: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (input.source_id === input.target_id) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot merge a note with itself" });
			}

			const event = ctx.event;

			let eventCodes = [event.code];
			if (event.meshedEvent && event.subEvents && !event.playoffMode) {
				eventCodes = eventCodes.concat(event.subEvents.map((se) => se.code));
			}

			const [sourceNote, targetNote] = await Promise.all([
				db.query.notes.findFirst({
					where: and(eq(notes.id, input.source_id), inArray(notes.event_code, eventCodes)),
					with: { messages: { orderBy: [asc(messages.id)] } },
				}),
				db.query.notes.findFirst({
					where: and(eq(notes.id, input.target_id), inArray(notes.event_code, eventCodes)),
				}),
			]);

			if (!sourceNote)
				throw new TRPCError({ code: "NOT_FOUND", message: "Source note not found or not accessible" });
			if (!targetNote)
				throw new TRPCError({ code: "NOT_FOUND", message: "Target note not found or not accessible" });

			// Move all messages from source to target (update event_code for cross-division merges)
			if (sourceNote.messages && sourceNote.messages.length > 0) {
				await db
					.update(messages)
					.set({ note_id: input.target_id, event_code: targetNote.event_code })
					.where(eq(messages.note_id, input.source_id));
			}

			// Add system message noting the merge origin
			const systemProfile: Profile = { id: -1, username: "Field", role: "FTA", admin: false };
			const mergeLabel = sourceNote.team
				? `Merged from ticket for team ${sourceNote.team}`
				: `Merged from note ${input.source_id.slice(0, 8)}`;
			const systemMsgInsert = await db
				.insert(messages)
				.values({
					id: randomUUID(),
					note_id: input.target_id,
					author_id: -1,
					author: systemProfile,
					text: mergeLabel,
					event_code: targetNote.event_code,
					created_at: new Date(),
					updated_at: new Date(),
				})
				.returning();

			await db.update(notes).set({ updated_at: new Date() }).where(eq(notes.id, input.target_id));

			// Clean up source: unlink matchEvents, then mark as merged (keep row for redirect)
			await db
				.update(matchEvents)
				.set({ converted_note_id: null, status: "active" })
				.where(eq(matchEvents.converted_note_id, input.source_id));
			await db.update(notes).set({ merged_into: input.target_id }).where(eq(notes.id, input.source_id));

			// Slack cleanup for source (may be a different sub-event's Slack integration)
			const sourceEvent =
				sourceNote.event_code !== event.code ? await getEvent("", sourceNote.event_code) : event;
			if (sourceEvent.slackTeam && sourceNote.slack_ts && sourceNote.slack_channel) {
				await deleteSlackMessage(sourceNote.slack_channel, sourceEvent.slackTeam, sourceNote.slack_ts);
			}

			// Notify clients viewing the source that it was deleted
			bus.publish(`event:${sourceNote.event_code}:note_update`, {
				kind: "delete",
				note: { ...sourceNote, followers: [] } as Note,
			});

			// Notify clients viewing the target about each moved message + system message
			if (sourceNote.messages) {
				for (const msg of sourceNote.messages) {
					bus.publish(`event:${targetNote.event_code}:note_update`, {
						kind: "add_message",
						note_id: input.target_id,
						message: { ...msg, note_id: input.target_id, event_code: targetNote.event_code } as Message,
					});
				}
			}
			if (systemMsgInsert[0]) {
				bus.publish(`event:${targetNote.event_code}:note_update`, {
					kind: "add_message",
					note_id: input.target_id,
					message: systemMsgInsert[0] as Message,
				});
			}

			// Return updated target with all messages and followers
			const updatedTarget = await db.query.notes.findFirst({
				where: eq(notes.id, input.target_id),
				with: { messages: { orderBy: [asc(messages.id)] } },
			});
			if (!updatedTarget)
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch updated target note" });
			const targetFollowers = await getNoteFollowers(input.target_id);
			return { ...updatedTarget, followers: targetFollowers } as Note;
		}),

	updateStatus: eventProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				new_status: z.enum(["Open", "Resolved", "Refused"]),
				event_code: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = ctx.event;

			const note = await db.query.notes.findFirst({
				where: and(eq(notes.id, input.id), eq(notes.event_code, input.event_code)),
			});
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

			if (!ctx.token) throw new TRPCError({ code: "BAD_REQUEST", message: "User token not provided" });
			const currentUserProfileRows = await db
				.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
				.from(users)
				.where(eq(users.token, ctx.token));
			const currentUserProfile = currentUserProfileRows[0];
			if (!currentUserProfile) throw new TRPCError({ code: "NOT_FOUND", message: "Current User not found" });

			const isClosing = input.new_status === "Resolved" || input.new_status === "Refused";

			const update = await db
				.update(notes)
				.set({
					resolution_status: input.new_status as any,
					closed_at: isClosing ? new Date() : null,
					resolved_by_id: isClosing ? currentUserProfile.id : null,
					resolved_by: isClosing ? currentUserProfile : null,
					fms_metadata: note.fms_metadata
						? {
								...(note.fms_metadata as FmsNoteMetadata),
								resolutionStatus: input.new_status === "Refused" ? "Resolved" : input.new_status,
							}
						: null,
					updated_at: new Date(),
				})
				.where(eq(notes.id, input.id))
				.returning();
			if (!update[0])
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update note status" });

			bus.publish(`event:${input.event_code}:note_update`, {
				kind: "status",
				note_id: update[0].id,
				resolution_status: update[0].resolution_status ?? "Open",
				resolved_by: isClosing ? currentUserProfile : null,
			});

			const statusFollowers = await getNoteFollowers(note.id);
			createNotification(
				statusFollowers.filter((id: number) => id !== currentUserProfile.id),
				buildNotification({
					kind: "note.statusChanged",
					eventCode: input.event_code,
					note: toNoteCtx(note as any),
					newStatus: input.new_status as "Open" | "Resolved" | "Refused",
					actor: currentUserProfile.username,
				}),
				input.event_code,
			);

			const statusNoteEvent = input.event_code !== event.code ? await getEvent("", input.event_code) : event;
			if (statusNoteEvent.slackTeam && note.slack_ts && note.slack_channel) {
				if (input.new_status === "Resolved") {
					await addSlackReaction(
						note.slack_channel,
						statusNoteEvent.slackTeam,
						note.slack_ts,
						"white_check_mark",
					);
				} else if (input.new_status === "Refused") {
					await addSlackReaction(note.slack_channel, statusNoteEvent.slackTeam, note.slack_ts, "x");
				} else {
					await removeSlackReaction(
						note.slack_channel,
						statusNoteEvent.slackTeam,
						note.slack_ts,
						"white_check_mark",
					);
					await removeSlackReaction(note.slack_channel, statusNoteEvent.slackTeam, note.slack_ts, "x");
				}
			}

			return { ...update[0], followers: statusFollowers } as Note;
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
			const event = ctx.event;

			const note = await db.query.notes.findFirst({
				where: and(eq(notes.id, input.id), eq(notes.event_code, input.event_code)),
			});
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

			const profile = await db
				.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
				.from(users)
				.where(eq(users.id, input.user_id));
			if (!profile[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve User profile" });

			const actorProfileAssign = await db
				.select({ id: users.id, username: users.username })
				.from(users)
				.where(eq(users.token, ctx.token as string));
			const actorIdAssign = actorProfileAssign[0]?.id;
			const actorUsernameAssign = actorProfileAssign[0]?.username ?? "Unknown";

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

			bus.publish(`event:${input.event_code}:note_update`, {
				kind: "assign",
				note_id: update[0].id,
				assigned_to_id: update[0].assigned_to_id,
				assigned_to: profile[0] as Profile,
			});

			const assignFollowers = await getNoteFollowers(note.id);
			createNotification(
				assignFollowers.filter((id: number) => id !== profile[0].id && id !== actorIdAssign),
				buildNotification({
					kind: "note.assigned",
					eventCode: input.event_code,
					note: toNoteCtx(note as any),
					assignee: profile[0].username,
					actor: actorUsernameAssign,
				}),
				input.event_code,
			);

			// Only notify the assignee if they didn't assign themselves
			if (profile[0].id !== actorIdAssign) {
				createNotification(
					[profile[0].id],
					buildNotification({
						kind: "note.assignedToYou",
						eventCode: input.event_code,
						note: toNoteCtx(note as any),
						actor: actorUsernameAssign,
					}),
					input.event_code,
				);
			}

			const assignNoteEvent = input.event_code !== event.code ? await getEvent("", input.event_code) : event;
			if (assignNoteEvent.slackTeam && note.slack_ts && note.slack_channel) {
				await addSlackReaction(note.slack_channel, assignNoteEvent.slackTeam, note.slack_ts, "eyes");
			}

			return { ...update[0], followers: assignFollowers } as Note;
		}),

	unAssign: eventProcedure
		.input(
			z.object({
				note_id: z.string().uuid(),
				event_code: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = ctx.event;

			const note = await db.query.notes.findFirst({
				where: and(eq(notes.id, input.note_id), eq(notes.event_code, input.event_code)),
			});
			if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

			if (note.assigned_to_id === null) {
				throw new TRPCError({ code: "NOT_FOUND", message: "No user currently assigned to this Note" });
			}

			let profile: Profile[] = [];
			if (note.assigned_to === null && note.assigned_to_id) {
				profile = await db
					.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
					.from(users)
					.where(eq(users.id, note.assigned_to_id));
			} else if (note.assigned_to !== null) {
				profile.push(note.assigned_to as Profile);
			}
			if (!profile[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Unable to find assigned User" });

			const actorProfileUnassign = await db
				.select({ id: users.id, username: users.username })
				.from(users)
				.where(eq(users.token, ctx.token as string));
			const actorIdUnassign = actorProfileUnassign[0]?.id;
			const actorUsernameUnassign = actorProfileUnassign[0]?.username ?? "Unknown";

			const update = await db
				.update(notes)
				.set({ assigned_to_id: null, assigned_to: null, updated_at: new Date() })
				.where(eq(notes.id, input.note_id))
				.returning();
			if (!update[0])
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update assignment" });

			bus.publish(`event:${input.event_code}:note_update`, {
				kind: "assign",
				note_id: update[0].id,
				assigned_to_id: update[0].assigned_to_id,
				assigned_to: null,
			});

			const unassignFollowers = await getNoteFollowers(note.id);
			createNotification(
				unassignFollowers.filter((id: number) => id !== actorIdUnassign),
				buildNotification({
					kind: "note.unassigned",
					eventCode: input.event_code,
					note: toNoteCtx(note as any),
					actor: actorUsernameUnassign,
				}),
				input.event_code,
			);

			// Only notify the previously-assigned user if they didn't unassign themselves
			if (profile[0].id !== actorIdUnassign) {
				createNotification(
					[profile[0].id],
					buildNotification({
						kind: "note.unassignedFromYou",
						eventCode: input.event_code,
						note: toNoteCtx(note as any),
						actor: actorUsernameUnassign,
					}),
					input.event_code,
				);
			}

			const unassignNoteEvent = input.event_code !== event.code ? await getEvent("", input.event_code) : event;
			if (unassignNoteEvent.slackTeam && note.slack_ts && note.slack_channel) {
				await removeSlackReaction(note.slack_channel, unassignNoteEvent.slackTeam, note.slack_ts, "eyes");
			}

			return { ...update[0], followers: unassignFollowers } as Note;
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

			const existing = await db.query.noteFollowers.findFirst({
				where: and(eq(noteFollowers.note_id, input.id), eq(noteFollowers.user_id, ctx.user.id)),
			});
			const isFollowing = !!existing;

			if (!isFollowing && input.follow === false) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Current User is not following this Note" });
			} else if (isFollowing && input.follow === true) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Current User is already following this Note" });
			} else if (input.follow === true) {
				await db.insert(noteFollowers).values({ note_id: input.id, user_id: ctx.user.id });
			} else {
				await db
					.delete(noteFollowers)
					.where(and(eq(noteFollowers.note_id, input.id), eq(noteFollowers.user_id, ctx.user.id)));
			}

			const followerIds = await getNoteFollowers(input.id);

			bus.publish(`event:${event.code}:note_update`, {
				kind: "follow",
				note_id: input.id,
				followers: followerIds,
			});

			return { ...note, followers: followerIds } as Note;
		}),

	generateNotesReport: eventProcedure.query(async ({ ctx }) => {
		const event = ctx.event;
		const path = await generateNotesReportPdf(event.code, event.name);
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
			const event = ctx.event;

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
					request_type: "CSA",
				})
				.returning();
			if (!insert[0])
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create Note from FMS" });

			const fmsNoteResult = { ...insert[0], followers: [] as number[] } as Note;
			bus.publish(`event:${event.code}:note_update`, { kind: "create", note: fmsNoteResult, source: "fms" });
			return fmsNoteResult;
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
			const event = ctx.event;

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

			const fmsEditFollowers = await getNoteFollowers(update[0].id);
			bus.publish(`event:${event.code}:note_update`, {
				kind: "edit",
				note: { ...update[0], followers: fmsEditFollowers } as Note,
				source: "fms",
			});
			return { ...update[0], followers: fmsEditFollowers } as Note;
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
			const event = ctx.event;
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
		const event = ctx.event;
		const note = await db.query.notes.findFirst({
			where: and(eq(notes.fms_note_id, input.fms_note_id), eq(notes.event_code, event.code)),
		});
		if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found for given FMS note ID" });
		return note as Note;
	}),

	deleteByFmsNoteId: eventProcedure.input(z.object({ fms_note_id: z.string() })).mutation(async ({ ctx, input }) => {
		const event = ctx.event;
		const note = await db.query.notes.findFirst({
			where: and(eq(notes.fms_note_id, input.fms_note_id), eq(notes.event_code, event.code)),
		});
		if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found for given FMS note ID" });
		await db.delete(messages).where(eq(messages.note_id, note.id));
		await db.delete(notes).where(eq(notes.id, note.id));
		bus.publish(`event:${event.code}:note_update`, { kind: "delete", note: note as Note, source: "fms" });
		return note.id;
	}),

	messages: messagesSubRouter,

	updateSubscription: publicProcedure
		.input(
			z.object({
				eventToken: z.string(),
				note_id: z.string().uuid().optional(),
				source: z.string().optional(),
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

			const opts = input.eventOptions;

			const handler = (data: NoteUpdateEventData) => {
				// eventOptions filtering
				if (opts && (opts as Record<string, boolean | undefined>)[data.kind] === false) return;

				// note_id filtering
				if (input.note_id) {
					if ("note" in data) {
						if (data.note.id !== input.note_id) return;
					} else if ("note_id" in data) {
						if (data.note_id !== input.note_id) return;
					}
				}

				push(data);
			};

			console.log(`[notes sub] start event=${event.code} source=${input.source ?? "unknown"}`);

			const eventCodesToListen = [event.code];
			if (event.meshedEvent && event.subEvents && !event.playoffMode) {
				eventCodesToListen.push(...event.subEvents.map((s) => s.code));
			}

			const unsubs: Array<() => void> = [];
			for (const code of eventCodesToListen) {
				unsubs.push(bus.subscribe(`event:${code}:note_update`, (data) => handler(data as NoteUpdateEventData)));
			}

			const heartbeat = setInterval(() => push({ kind: "heartbeat" }), 30_000);

			try {
				yield* drain();
			} finally {
				for (const unsub of unsubs) unsub();
				clearInterval(heartbeat);
				console.log(`[notes sub] ended event=${event.code}`);
			}
		}),
	pushSubscription: publicProcedure.input(z.object({ token: z.string() })).subscription(async function* ({
		input,
		signal,
	}) {
		const user = await db.query.users.findFirst({ where: eq(users.token, input.token) });
		if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

		const { push: pushNotif, drain: drainNotif } = subscriptionQueue<Notification>(signal!);
		const unsub = bus.subscribe("global:notification", async (raw) => {
			const d = raw as { users: number[]; notification: Notification };
			if (!d.users.includes(user.id)) return;
			// Re-fetch active_event_code each message (subscription is long-lived)
			const currentUser = await db.query.users.findFirst({
				where: eq(users.token, input.token),
				columns: { id: true, active_event_code: true },
			});
			if (!currentUser) return;
			const notif = d.notification as Notification;
			if (notif.eventCode && currentUser.active_event_code && notif.eventCode !== currentUser.active_event_code) {
				// Allow sub-event notifications through when the user is on a meshed parent event
				const parentEvent = await db.query.events.findFirst({
					where: eq(events.code, currentUser.active_event_code),
					columns: { meshedEvent: true },
				});
				const subCodes = parentEvent?.meshedEvent
					? (parentEvent.meshedEvent as Array<{ code: string }>).map((e) => e.code)
					: [];
				if (!subCodes.includes(notif.eventCode)) return;
			}
			pushNotif(notif);
		});
		try {
			yield* drainNotif();
		} finally {
			unsub();
		}
	}),
	registerPush: protectedProcedure
		.input(
			z.object({
				endpoint: z.string(),
				expirationTime: z.date().nullable(),
				keys: z.object({ p256dh: z.string(), auth: z.string() }),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await db
				.insert(pushSubscriptions)
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

export async function getEventMessages(event_code: string) {
	const eventMessages = await db.query.messages.findMany({
		where: eq(messages.event_code, event_code),
		orderBy: [asc(messages.created_at)],
	});
	if (!eventMessages) throw new TRPCError({ code: "NOT_FOUND", message: "Unable to find Messages for this event" });
	return eventMessages;
}

export async function updateNoteStatusFromSlack(message_ts: string, resolved: boolean, slackUserId?: string) {
	const note = await db.query.notes.findFirst({ where: eq(notes.slack_ts, message_ts) });
	if (!note) return null;

	const event = await getEvent("", note.event_code);

	// Resolve who performed the action
	let resolverProfile: Profile | null = null;
	if (resolved && slackUserId && event.slackTeam) {
		try {
			resolverProfile = await resolveSlackUserProfile(slackUserId, event.slackTeam);
		} catch {
			resolverProfile = { id: -1, role: "CSA", admin: false, username: "Slack User", source: "Slack" };
		}
	}

	const newStatus = resolved ? "Resolved" : "Open";
	const update = await db
		.update(notes)
		.set({
			resolution_status: newStatus as any,
			closed_at: resolved ? new Date() : null,
			resolved_by_id: resolved ? (resolverProfile?.id ?? null) : null,
			resolved_by: resolved ? resolverProfile : null,
			updated_at: new Date(),
		})
		.where(eq(notes.id, note.id))
		.returning();

	bus.publish(`event:${event.code}:note_update`, {
		kind: "status",
		note_id: update[0].id,
		resolution_status: update[0].resolution_status ?? "Open",
		resolved_by: resolved ? resolverProfile : null,
	});

	const slackStatusFollowers = await getNoteFollowers(note.id);
	createNotification(
		slackStatusFollowers,
		buildNotification({
			kind: "note.statusChanged",
			eventCode: event.code,
			note: toNoteCtx(note as any),
			newStatus: newStatus as "Open" | "Resolved",
			actor: resolverProfile?.username ?? "Slack",
		}),
		event.code,
	);

	if (!resolved && note.slack_channel && event.slackTeam && note.slack_ts) {
		removeSlackReaction(note.slack_channel, event.slackTeam, note.slack_ts, "white_check_mark");
	}

	return update[0] as Note;
}

export async function updateNoteAssignmentFromSlack(message_ts: string, add: boolean, slackUser: string) {
	const note = await db.query.notes.findFirst({ where: eq(notes.slack_ts, message_ts) });
	if (!note) return null;

	const event = await getEvent("", note.event_code);
	const profile: Profile = event.slackTeam
		? await resolveSlackUserProfile(slackUser, event.slackTeam)
		: { id: -1, role: "CSA", admin: false, username: "Slack User" };

	const update = await db
		.update(notes)
		.set({
			assigned_to_id: add ? profile.id : null,
			assigned_to: add ? profile : null,
			updated_at: new Date(),
		})
		.where(eq(notes.id, note.id))
		.returning();

	const slackAssignFollowers = await getNoteFollowers(note.id);
	if (add) {
		bus.publish(`event:${event.code}:note_update`, {
			kind: "assign",
			note_id: update[0].id,
			assigned_to_id: update[0].assigned_to_id,
			assigned_to: profile,
		});
		createNotification(
			slackAssignFollowers,
			buildNotification({
				kind: "note.assigned",
				eventCode: event.code,
				note: toNoteCtx(note as any),
				assignee: profile.username,
				actor: "Slack",
			}),
			event.code,
		);
	} else {
		bus.publish(`event:${event.code}:note_update`, {
			kind: "assign",
			note_id: update[0].id,
			assigned_to_id: update[0].assigned_to_id,
			assigned_to: null,
		});
		createNotification(
			slackAssignFollowers,
			buildNotification({
				kind: "note.unassigned",
				eventCode: event.code,
				note: toNoteCtx(note as any),
				actor: "Slack",
			}),
			event.code,
		);
		if (note.slack_channel && event.slackTeam && note.slack_ts) {
			removeSlackReaction(note.slack_channel, event.slackTeam, note.slack_ts, "eyes");
		}
	}

	return update[0] as Note;
}

/**
 * Parses an incoming Nexus Slack bot message into structured note fields.
 *
 * Supported formats:
 *  1. FTA CSA request:
 *     text = "FTA request for team 5478 [D8]: Radio reboot, please check connections"
 *     block sections may include "had issues in Qualification 72" and "FTA notes:..."
 *
 *  2. Volunteer request:
 *     text = "A volunteer has requested help on behalf of team 9455"
 *     block sections include "Team 9455 needs help with the following:" and the note text
 */
function parseNexusMessage(
	text: string,
	blocks?: any[],
): {
	team: number | null;
	matchNumber: number | null;
	tournamentLevel: "None" | "Practice" | "Qualification" | "Playoff" | null;
	playNumber: number | null;
	noteText: string;
} {
	// Collect all human-readable text from blocks for richer parsing
	const allText: string[] = [text];
	if (blocks) {
		for (const block of blocks) {
			if (block.type === "section" && block.text?.text) {
				allText.push(block.text.text);
			} else if (block.type === "rich_text" && block.elements) {
				for (const elem of block.elements) {
					if (elem.elements) {
						for (const inner of elem.elements) {
							if (inner.text) allText.push(inner.text);
						}
					}
				}
			}
		}
	}
	const combined = allText.join("\n");

	// Team number
	const teamMatch = combined.match(/team (\d+)/i);
	const team = teamMatch ? parseInt(teamMatch[1]) : null;

	// Match info: "had issues in Qualification 72" or "Qualification 72"
	const matchMatch = combined.match(/had issues in (Qualification|Practice|Playoff)(?: match)? (\d+)/i);
	let matchNumber: number | null = null;
	let tournamentLevel: "None" | "Practice" | "Qualification" | "Playoff" | null = null;
	if (matchMatch) {
		const lvl = matchMatch[1];
		tournamentLevel = (lvl.charAt(0).toUpperCase() + lvl.slice(1).toLowerCase()) as Exclude<
			typeof tournamentLevel,
			null
		>;
		matchNumber = parseInt(matchMatch[2]);
	}

	// Note text - try "FTA notes: ..." blocks first, then volunteer "needs help with" block, then fall back to text suffix
	let noteText = "";
	const ftaNotesMatch = combined.match(/FTA notes[:\s]+([\s\S]+)$/i);
	const volunteerNotesMatch = combined.match(/(?:needs|has requested) help with the following:\s*([\s\S]+)$/i);
	if (ftaNotesMatch) {
		noteText = ftaNotesMatch[1].trim();
	} else if (volunteerNotesMatch) {
		noteText = volunteerNotesMatch[1].trim();
	} else {
		// "FTA request for team 5478 [D8]: Radio reboot..."
		const colonMatch = text.match(/\]\s*:\s*(.+)$/);
		if (colonMatch) noteText = colonMatch[1].trim();
	}
	if (!noteText) noteText = text;
	noteText = noteText.replace(/^(?:&gt;|>){1,3}\s*/, "").trim();

	return { team, matchNumber, tournamentLevel, playNumber: null, noteText };
}

/**
 * Creates a note from an incoming Nexus Slack bot message.
 * Sets slack_ts to the Nexus message ts so thread replies and reactions sync normally.
 * Posts a reply in the thread with a link back to the FTA Buddy ticket.
 *
 * For meshed events where multiple fields share one Slack channel, the team number is used
 * to route the note to the correct sub-event.
 */
export async function createFromNexus(channel_id: string, message_ts: string, text: string, blocks?: any[]) {
	// Find all events linked to this Slack channel (multiple sub-events may share one channel)
	const linkedEventRows = await db
		.select({ code: events.code, slackTeam: events.slackTeam })
		.from(events)
		.where(eq(events.slackChannel, channel_id))
		.execute();
	if (linkedEventRows.length === 0) return;

	const { team, matchNumber, tournamentLevel, playNumber, noteText } = parseNexusMessage(text, blocks);

	// The Slack workspace ID - same across all linked events; grab the first non-null one.
	const slackTeam = linkedEventRows.find((r) => r.slackTeam)?.slackTeam ?? null;

	// Resolve which event/sub-event owns this team.
	// Walk linked events; for meshed events expand to sub-event team lists.
	let targetEventCode = linkedEventRows[0].code;
	let linkEvent = await getEvent("", targetEventCode); // used for notification users + ticket URL

	if (team !== null) {
		for (const row of linkedEventRows) {
			const ev = await getEvent("", row.code);
			if (ev.meshedEvent && ev.subEvents) {
				const ownerSub = ev.subEvents.find((sub) => sub.teams.some((t) => parseInt(t.number, 10) === team));
				if (ownerSub) {
					targetEventCode = ownerSub.code;
					linkEvent = ev; // meshed event has all users merged; use it for notifications + URL
					break;
				}
			} else {
				const teamInEvent = await db
					.select({ teamNumber: schema.checklist.teamNumber })
					.from(schema.checklist)
					.where(and(eq(schema.checklist.eventCode, ev.code), eq(schema.checklist.teamNumber, String(team))))
					.limit(1);
				if (teamInEvent.length > 0) {
					targetEventCode = row.code;
					linkEvent = ev;
					break;
				}
			}
		}
	}

	// noteEvent is the specific sub-event (or the only linked event) where the note is filed.
	const noteEvent = targetEventCode === linkEvent.code ? linkEvent : await getEvent("", targetEventCode);

	const matchId = await resolveMatchId(noteEvent.code, matchNumber, playNumber, tournamentLevel);

	const author: Profile = { id: -1, username: "Nexus", role: "FTA", admin: false, source: "Slack" };

	const noteId = randomUUID();
	const insert = await db
		.insert(notes)
		.values({
			id: noteId,
			team: team ?? null,
			text: noteText,
			author_id: -1,
			author,
			note_type: "TeamIssue",
			resolution_status: "Open",
			match_number: matchNumber ?? null,
			play_number: playNumber ?? null,
			tournament_level: tournamentLevel ?? null,
			fms_note_id: null,
			fms_record_version: null,
			fms_metadata: null,
			event_code: noteEvent.code,
			created_at: new Date(),
			updated_at: new Date(),
			match_id: matchId,
			request_type: "CSA",
			slack_ts: message_ts,
			slack_channel: channel_id,
			is_nexus: true,
		})
		.returning();

	if (!insert[0]) return;

	const nexusNoteResult = { ...insert[0], followers: [] as number[] } as Note;
	bus.publish(`event:${noteEvent.code}:note_update`, { kind: "create", note: nexusNoteResult });

	// Notify users on linkEvent (the meshed parent if applicable - it has all sub-event users merged)
	createNotification(
		linkEvent.users.map((u) => u.id),
		buildNotification({
			kind: "note.created",
			eventCode: noteEvent.code,
			note: toNoteCtx(nexusNoteResult),
			author: "Nexus",
		}),
		noteEvent.code,
	);

	// Reply in the Nexus thread with a link to the ticket.
	// Use linkEvent code + token so users with the meshed event access can follow the URL.
	if (slackTeam) {
		try {
			await sendSlackMessage(
				channel_id,
				slackTeam,
				{
					blocks: [
						{
							type: "section",
							text: {
								type: "mrkdwn",
								text: "Ticket created in FTA Buddy.",
							},
							accessory: {
								type: "button",
								text: { type: "plain_text", text: "View Ticket", emoji: true },
								url: `https://ftabuddy.com/notepad/view/${linkEvent.code}/${noteId}?token=${linkEvent.token}`,
							},
						},
					],
				},
				message_ts,
			);
		} catch (err) {
			console.error("[Nexus] Failed to post reply to Nexus thread:", err);
		}
	}
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

	// Deduplication: skip messages we already have (e.g. ones FTA-Buddy posted to Slack that echo back)
	const existing = await db.query.messages.findFirst({ where: eq(messages.slack_ts, message_ts) });
	if (existing) return;

	const event = await getEvent("", note.event_code);
	const user: Profile = event.slackTeam
		? await resolveSlackUserProfile(author_id, event.slackTeam)
		: { id: -1, role: "CSA", admin: false, username: "Slack User", source: "Slack" };
	if (!user.source) user.source = "Slack";

	const resolvedText = event.slackTeam ? await resolveSlackMentions(text, event.slackTeam) : text;

	const insert = await db
		.insert(messages)
		.values({
			id: randomUUID(),
			note_id: note.id,
			author_id: user.id,
			author: user,
			text: resolvedText,
			event_code: note.event_code,
			created_at: new Date(),
			updated_at: new Date(),
			slack_ts: message_ts,
			slack_channel: channel_id,
		})
		.returning();

	bus.publish(`event:${event.code}:note_update`, {
		kind: "add_message",
		note_id: note.id,
		message: insert[0] as Message,
	});

	const slackMsgFollowers = await getNoteFollowers(note.id);
	createNotification(
		slackMsgFollowers,
		buildNotification({
			kind: "note.message",
			eventCode: event.code,
			note: toNoteCtx(note as any),
			author: user.username,
			messageText: text,
		}),
		event.code,
	);
}

/**
 * Handles the /ftabuddy-ticket slash command.
 * Fetches the parent message of the thread, creates a note, and returns
 * an ephemeral confirmation with a link to the ticket.
 */
export async function createFromSlashCommand(
	channel_id: string,
	slack_workspace_id: string,
	slack_user_id: string,
	thread_ts: string,
	teamNumber: number,
): Promise<{ response_type: "ephemeral"; text?: string; blocks?: any[] }> {
	let linkedEventRows = await db
		.select({ code: events.code, slackTeam: events.slackTeam })
		.from(events)
		.where(eq(events.slackChannel, channel_id))
		.execute();

	if (linkedEventRows.length === 0) {
		// Channel isn't directly linked — try to find the right sub-event by team number.
		// Only consider non-meshed, non-archived events that have Slack configured.
		// Meshed/combined parent events are excluded (meshedEvent IS NULL) because they
		// duplicate all sub-event teams and would produce false matches.
		const matchRows = await db
			.select({ code: events.code, slackTeam: events.slackTeam })
			.from(events)
			.innerJoin(schema.checklist, eq(schema.checklist.eventCode, events.code))
			.where(
				and(
					isNotNull(events.slackChannel),
					isNull(events.meshedEvent),
					eq(events.archived, false),
					eq(schema.checklist.teamNumber, teamNumber.toString()),
				),
			)
			.limit(1)
			.execute();

		if (matchRows.length === 0) {
			return {
				response_type: "ephemeral",
				text: `This channel is not linked to an FTA-Buddy event, and no active event was found for team ${teamNumber}.`,
			};
		}

		linkedEventRows = [{ code: matchRows[0].code, slackTeam: matchRows[0].slackTeam }];
	}

	const existingNote = await db.query.notes.findFirst({ where: eq(notes.slack_ts, thread_ts) });
	if (existingNote) {
		const existingEvent = await getEvent("", existingNote.event_code);
		return {
			response_type: "ephemeral",
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: "A ticket already exists for this thread.",
					},
					accessory: {
						type: "button",
						text: { type: "plain_text", text: "View Ticket", emoji: true },
						url: `https://ftabuddy.com/notepad/view/${existingEvent.code}/${existingNote.id}?token=${existingEvent.token}`,
					},
				},
			],
		};
	}

	const messageText = await fetchSlackMessage(channel_id, slack_workspace_id, thread_ts);
	if (!messageText) {
		return {
			response_type: "ephemeral",
			text: "Could not fetch the thread message. Make sure the bot has access to this channel.",
		};
	}

	const author: Profile = await resolveSlackUserProfile(slack_user_id, slack_workspace_id);
	if (!author.source) author.source = "Slack";

	// Find the right sub-event for this team (same logic as createFromNexus)
	let targetEventCode = linkedEventRows[0].code;
	let linkEvent = await getEvent("", targetEventCode);

	for (const row of linkedEventRows) {
		const ev = await getEvent("", row.code);
		if (ev.meshedEvent && ev.subEvents) {
			const ownerSub = ev.subEvents.find((sub) => sub.teams.some((t) => parseInt(t.number, 10) === teamNumber));
			if (ownerSub) {
				targetEventCode = ownerSub.code;
				linkEvent = ev;
				break;
			}
		} else {
			const teamInEvent = await db
				.select({ teamNumber: schema.checklist.teamNumber })
				.from(schema.checklist)
				.where(
					and(eq(schema.checklist.eventCode, ev.code), eq(schema.checklist.teamNumber, String(teamNumber))),
				)
				.limit(1);
			if (teamInEvent.length > 0) {
				targetEventCode = row.code;
				linkEvent = ev;
				break;
			}
		}
	}

	const noteEvent = targetEventCode === linkEvent.code ? linkEvent : await getEvent("", targetEventCode);

	const noteId = randomUUID();
	const insert = await db
		.insert(notes)
		.values({
			id: noteId,
			team: teamNumber,
			text: messageText,
			author_id: author.id,
			author,
			note_type: "TeamIssue",
			resolution_status: "Open",
			match_number: null,
			play_number: null,
			tournament_level: null,
			fms_note_id: null,
			fms_record_version: null,
			fms_metadata: null,
			event_code: noteEvent.code,
			created_at: new Date(),
			updated_at: new Date(),
			request_type: null,
			slack_ts: thread_ts,
			slack_channel: channel_id,
			is_nexus: false,
		})
		.returning();

	if (!insert[0]) {
		return { response_type: "ephemeral", text: "Failed to create ticket." };
	}

	// Import existing thread replies and reactions before publishing so clients
	// see a fully-populated note the moment it arrives.
	const [existingReplies, existingReactions] = await Promise.all([
		fetchSlackThreadReplies(channel_id, slack_workspace_id, thread_ts).catch(() => []),
		fetchSlackMessageReactions(channel_id, slack_workspace_id, thread_ts).catch(() => []),
	]);

	for (const reply of existingReplies) {
		// Skip bots and system messages
		if (!reply.user || reply.bot_id) continue;
		const alreadyExists = await db.query.messages.findFirst({ where: eq(messages.slack_ts, reply.ts) });
		if (alreadyExists) continue;
		const replyAuthor = await resolveSlackUserProfile(reply.user, slack_workspace_id);
		if (!replyAuthor.source) replyAuthor.source = "Slack";
		await db.insert(messages).values({
			id: randomUUID(),
			note_id: insert[0].id,
			author_id: replyAuthor.id,
			author: replyAuthor,
			text: await resolveSlackMentions(reply.text, slack_workspace_id),
			event_code: noteEvent.code,
			created_at: new Date(parseFloat(reply.ts) * 1000),
			updated_at: new Date(parseFloat(reply.ts) * 1000),
			slack_ts: reply.ts,
			slack_channel: channel_id,
		});
	}

	const noteResult = { ...insert[0], followers: [] as number[] } as Note;
	bus.publish(`event:${noteEvent.code}:note_update`, { kind: "create", note: noteResult });

	// Apply existing reactions after the note is published; each fires its own bus update.
	const checkmarkReaction = existingReactions.find((r) => r.name === "white_check_mark");
	if (checkmarkReaction?.users.length) {
		await updateNoteStatusFromSlack(thread_ts, true, checkmarkReaction.users[0]).catch(() => null);
	}
	const eyesReaction = existingReactions.find((r) => r.name === "eyes");
	if (eyesReaction?.users.length) {
		await updateNoteAssignmentFromSlack(thread_ts, true, eyesReaction.users[0]).catch(() => null);
	}

	createNotification(
		linkEvent.users.map((u) => u.id),
		buildNotification({
			kind: "note.created",
			eventCode: noteEvent.code,
			note: toNoteCtx(noteResult),
			author: author.username,
		}),
		noteEvent.code,
	);

	const ticketUrl = `https://ftabuddy.com/notepad/view/${linkEvent.code}/${noteId}?token=${linkEvent.token}`;

	// Post a public reply in the thread so everyone in the channel sees the ticket link
	try {
		await sendSlackMessage(
			channel_id,
			slack_workspace_id,
			{
				blocks: [
					{
						type: "section",
						text: { type: "mrkdwn", text: `Ticket created in FTA Buddy for Team ${teamNumber}.` },
						accessory: {
							type: "button",
							text: { type: "plain_text", text: "View Ticket", emoji: true },
							url: ticketUrl,
						},
					},
				],
			},
			thread_ts,
		);
	} catch (err) {
		console.error("[/ftabuddy-ticket] Failed to post thread reply:", err);
	}

	return {
		response_type: "ephemeral",
		blocks: [
			{
				type: "section",
				text: { type: "mrkdwn", text: `Ticket created for Team ${teamNumber}.` },
				accessory: {
					type: "button",
					text: { type: "plain_text", text: "View Ticket", emoji: true },
					url: ticketUrl,
				},
			},
		],
	};
}
