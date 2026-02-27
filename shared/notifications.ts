/**
 * Notification builder — pure function, no DB calls.
 * Importable from both server (src/) and client (app/src/).
 *
 * Usage:
 *   import { buildNotification, toNoteCtx } from "../../shared/notifications";
 *   const payload = buildNotification({ kind: "note.created", note: toNoteCtx(row), author: "Filip" });
 *   createNotification(userIds, payload);  // server side
 *   toast(payload.short ?? payload.title, payload.body ?? "");  // client side
 *
 * To add a new kind:
 *   1. Add a string literal to NotificationKind.
 *   2. Add a context type to NotificationContext.
 *   3. Add a case to the switch in buildNotification().
 *   4. Add a topic mapping to TOPIC_FOR_KIND.
 */

import type { Notification, TournamentLevel } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Kinds
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationKind =
	| "note.created"
	| "note.message"
	| "note.statusChanged"
	| "note.assigned"
	| "note.assignedToYou"
	| "note.unassigned"
	| "note.unassignedFromYou"
	| "event.general"
	| "robot.warning";

export type Urgency = "low" | "normal" | "high";

// ─────────────────────────────────────────────────────────────────────────────
// Per-note context (reused across many kinds)
// ─────────────────────────────────────────────────────────────────────────────

export interface NoteContext {
	noteId: string;
	team: number | null;
	noteType: "TeamIssue" | "EventNote" | "MatchNote";
	text: string;
	matchNumber: number | null;
	playNumber: number | null;
	tournamentLevel: TournamentLevel | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Discriminated union of per-kind context objects
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationContext =
	| { kind: "note.created"; note: NoteContext; author: string }
	| { kind: "note.message"; note: NoteContext; author: string; messageText: string; messageId?: string }
	| { kind: "note.statusChanged"; note: NoteContext; newStatus: "Open" | "Resolved"; actor: string }
	| { kind: "note.assigned"; note: NoteContext; assignee: string; actor: string }
	| { kind: "note.assignedToYou"; note: NoteContext; actor: string }
	| { kind: "note.unassigned"; note: NoteContext; actor: string }
	| { kind: "note.unassignedFromYou"; note: NoteContext; actor: string }
	| { kind: "event.general"; title: string; body: string }
	| { kind: "robot.warning"; station: string; team: number | null; warning: string };

// ─────────────────────────────────────────────────────────────────────────────
// Internal formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

const MAX_TITLE = 50;
const MAX_BODY = 120;

function trunc(s: string, max: number): string {
	return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

/**
 * Format a tournament match into a compact abbreviation.
 * Examples: "Q32", "P3", "P3-2", "Prac1"
 * Returns null when matchNumber is absent / 0.
 */
export function formatMatchId(
	level: TournamentLevel | null | undefined,
	matchNumber: number | null | undefined,
	playNumber: number | null | undefined,
): string | null {
	if (!matchNumber) return null;
	const play = playNumber && playNumber > 1 ? `-${playNumber}` : "";
	switch (level) {
		case "Qualification":
			return `Q${matchNumber}`;
		case "Playoff":
			return `P${matchNumber}${play}`;
		case "Practice":
			return `Prac${matchNumber}`;
		default:
			return null;
	}
}

function noteLabel(note: NoteContext): string {
	const parts: string[] = [];
	if (note.team) parts.push(`Team #${note.team}`);
	const match = formatMatchId(note.tournamentLevel, note.matchNumber, note.playNumber);
	if (match) parts.push(match);
	return parts.join(" • ");
}

function noteUrl(noteId: string): string {
	return `notepad/view/${noteId}`;
}

// Maps notification kind → legacy NotificationTopic used by the SW TOPIC_CATEGORY table
// and by the SSE subscription dispatcher in notifications.ts.
const TOPIC_FOR_KIND: Record<NotificationKind, Notification["topic"]> = {
	"note.created": "Note-Created",
	"note.message": "New-Note-Message",
	"note.statusChanged": "Note-Status",
	"note.assigned": "Note-Assigned",
	"note.assignedToYou": "Note-Assigned",
	"note.unassigned": "Note-Assigned",
	"note.unassignedFromYou": "Note-Assigned",
	"event.general": "Robot-Status",
	"robot.warning": "Robot-Status",
};

// ─────────────────────────────────────────────────────────────────────────────
// Main builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildNotification(ctx: NotificationContext): Notification {
	const now = new Date();
	let title: string;
	let body: string;
	let tag: string;
	let id: string;
	let urgency: Urgency = "normal";
	let url: string;

	switch (ctx.kind) {
		case "note.created": {
			const label = noteLabel(ctx.note);
			const fallback =
				ctx.note.noteType === "EventNote"
					? "Event Note"
					: ctx.note.noteType === "MatchNote"
						? "Match Note"
						: label || "Note";
			title = trunc(`New Note • ${label || fallback}`, MAX_TITLE);
			body = trunc(`${ctx.note.text} • by ${ctx.author}`, MAX_BODY);
			tag = `note-${ctx.note.noteId}`;
			id = `note.created:${ctx.note.noteId}`;
			url = noteUrl(ctx.note.noteId);
			break;
		}

		case "note.message": {
			const label = noteLabel(ctx.note);
			title = trunc(`New Message${label ? " • " + label : ""}`, MAX_TITLE);
			body = trunc(`${ctx.messageText} • by ${ctx.author}`, MAX_BODY);
			tag = `note-${ctx.note.noteId}`;
			id = ctx.messageId
				? `note.message:${ctx.messageId}`
				: `note.message:${ctx.note.noteId}:${Math.floor(now.getTime() / 1000)}`;
			url = noteUrl(ctx.note.noteId);
			break;
		}

		case "note.statusChanged": {
			const label = noteLabel(ctx.note);
			const suffix = label ? ` • ${label}` : "";
			if (ctx.newStatus === "Resolved") {
				title = trunc(`✓ Note Resolved${suffix}`, MAX_TITLE);
				urgency = "low";
			} else {
				title = trunc(`Note Reopened${suffix}`, MAX_TITLE);
			}
			body = trunc(`${ctx.newStatus === "Resolved" ? "Closed" : "Reopened"} by ${ctx.actor}`, MAX_BODY);
			tag = `note-${ctx.note.noteId}`;
			id = `note.status:${ctx.note.noteId}:${ctx.newStatus}:${Math.floor(now.getTime() / 1000)}`;
			url = noteUrl(ctx.note.noteId);
			break;
		}

		case "note.assigned": {
			const label = noteLabel(ctx.note);
			const suffix = label ? ` • ${label}` : "";
			title = trunc(`Note Assigned${suffix}`, MAX_TITLE);
			body = trunc(`Assigned to ${ctx.assignee} by ${ctx.actor}`, MAX_BODY);
			tag = `note-${ctx.note.noteId}`;
			id = `note.assigned:${ctx.note.noteId}:${Math.floor(now.getTime() / 1000)}`;
			url = noteUrl(ctx.note.noteId);
			break;
		}

		case "note.assignedToYou": {
			const label = noteLabel(ctx.note);
			const suffix = label ? ` • ${label}` : "";
			title = trunc(`Assigned to You${suffix}`, MAX_TITLE);
			body = trunc(`"${ctx.note.text.slice(0, 60)}" by ${ctx.actor}`, MAX_BODY);
			tag = `note-${ctx.note.noteId}`;
			id = `note.assigned-you:${ctx.note.noteId}`;
			urgency = "high";
			url = noteUrl(ctx.note.noteId);
			break;
		}

		case "note.unassigned": {
			const label = noteLabel(ctx.note);
			const suffix = label ? ` • ${label}` : "";
			title = trunc(`Note Unassigned${suffix}`, MAX_TITLE);
			body = trunc(`Unassigned by ${ctx.actor}`, MAX_BODY);
			tag = `note-${ctx.note.noteId}`;
			id = `note.unassigned:${ctx.note.noteId}:${Math.floor(now.getTime() / 1000)}`;
			url = noteUrl(ctx.note.noteId);
			break;
		}

		case "note.unassignedFromYou": {
			const label = noteLabel(ctx.note);
			const suffix = label ? ` • ${label}` : "";
			title = trunc(`No Longer Assigned${suffix}`, MAX_TITLE);
			body = trunc(`Removed by ${ctx.actor}`, MAX_BODY);
			tag = `note-${ctx.note.noteId}`;
			id = `note.unassigned-you:${ctx.note.noteId}:${Math.floor(now.getTime() / 1000)}`;
			url = noteUrl(ctx.note.noteId);
			break;
		}

		case "event.general": {
			title = trunc(ctx.title, MAX_TITLE);
			body = trunc(ctx.body, MAX_BODY);
			tag = `event-general`;
			id = `event.general:${Math.floor(now.getTime() / 1000)}`;
			url = "";
			urgency = "low";
			break;
		}

		case "robot.warning": {
			const teamPart = ctx.team ? `Team #${ctx.team}` : ctx.station;
			title = trunc(`⚠ Robot Warning • ${teamPart}`, MAX_TITLE);
			body = trunc(ctx.warning, MAX_BODY);
			tag = `robot-${ctx.station}`;
			id = `robot.warning:${ctx.station}:${Math.floor(now.getTime() / 1000)}`;
			url = "";
			urgency = "high";
			break;
		}

		default: {
			// TypeScript exhaustiveness guard
			const _exhaustive: never = ctx;
			title = "FTA Buddy";
			body = "";
			tag = `unknown`;
			id = `unknown:${now.getTime()}`;
			url = "";
			break;
		}
	}

	return {
		id,
		timestamp: now,
		topic: TOPIC_FOR_KIND[(ctx as NotificationContext).kind],
		title,
		body,
		tag,
		kind: ctx.kind,
		urgency,
		data: {
			page: url,
			...("note" in ctx ? { note_id: ctx.note.noteId } : {}),
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: extract NoteContext from a Note-shaped DB row or client Note object
// ─────────────────────────────────────────────────────────────────────────────

export function toNoteCtx(note: {
	id: string;
	team: number | null;
	note_type: string;
	text: string;
	match_number: number | null;
	play_number: number | null;
	tournament_level: TournamentLevel | null;
}): NoteContext {
	return {
		noteId: note.id,
		team: note.team,
		noteType: note.note_type as NoteContext["noteType"],
		text: note.text,
		matchNumber: note.match_number,
		playNumber: note.play_number,
		tournamentLevel: note.tournament_level,
	};
}
