import type { Message, Note, Profile } from "../../shared/types";

/**
 * Column projection that produces a Profile-shaped object when loaded via
 * Drizzle's relational query. Used in every `with: { author: ... }` join so
 * sensitive user fields (email, firebase_uid, password, token, slack_user_id)
 * never leak across the tRPC boundary.
 */
export const profileColumns = {
	id: true,
	username: true,
	role: true,
	admin: true,
} as const;

/** `with` clause for note reads: loads author/assigned_to/resolved_by + nested message authors. */
export const noteWith = {
	author: { columns: profileColumns },
	assigned_to: { columns: profileColumns },
	resolved_by: { columns: profileColumns },
	messages: {
		with: {
			author: { columns: profileColumns },
		},
	},
} as const;

/** `with` clause for message reads. */
export const messageWith = {
	author: { columns: profileColumns },
} as const;

/** Row shape returned when querying notes with `noteWith` joined. */
type NoteRow = {
	id: string;
	text: string;
	author_id: number;
	author: Profile;
	team: number | null;
	note_type: "TeamIssue" | "EventNote" | "MatchNote";
	resolution_status: Note["resolution_status"];
	issue_type: Note["issue_type"];
	match_number: number | null;
	play_number: number | null;
	tournament_level: Note["tournament_level"];
	fms_note_id: string | null;
	fms_record_version: number | null;
	fms_metadata: Note["fms_metadata"];
	event_code: string;
	created_at: Date;
	updated_at: Date;
	closed_at: Date | null;
	assigned_to_id: number | null;
	assigned_to: Profile | null;
	slack_ts: string | null;
	slack_channel: string | null;
	match_id: string | null;
	resolved_by_id: number | null;
	resolved_by: Profile | null;
	request_type: "CSA" | "RI" | null;
	is_nexus: boolean;
	merged_into: string | null;
	integration: "Slack" | "FMS" | null;
	author_display_name: string | null;
	messages?: MessageRow[];
};

type MessageRow = {
	id: string;
	note_id: string;
	text: string;
	author_id: number;
	author: Profile;
	event_code: string;
	created_at: Date;
	updated_at: Date;
	slack_ts: string | null;
	slack_channel: string | null;
	integration: "Slack" | "FMS" | null;
	author_display_name: string | null;
};

/** Projects a note row (loaded with `noteWith`) to the Note wire shape. */
export function noteToWire(row: NoteRow, followers: number[] = []): Note {
	return {
		id: row.id,
		text: row.text,
		author_id: row.author_id,
		author: row.author,
		team: row.team,
		note_type: row.note_type,
		resolution_status: row.resolution_status,
		issue_type: row.issue_type,
		match_number: row.match_number,
		play_number: row.play_number,
		tournament_level: row.tournament_level,
		fms_note_id: row.fms_note_id,
		fms_record_version: row.fms_record_version,
		fms_metadata: row.fms_metadata,
		event_code: row.event_code,
		created_at: row.created_at,
		updated_at: row.updated_at,
		closed_at: row.closed_at,
		assigned_to_id: row.assigned_to_id,
		assigned_to: row.assigned_to,
		followers,
		match_id: row.match_id,
		slack_ts: row.slack_ts,
		slack_channel: row.slack_channel,
		resolved_by_id: row.resolved_by_id,
		resolved_by: row.resolved_by,
		request_type: row.request_type,
		is_nexus: row.is_nexus,
		merged_into: row.merged_into,
		integration: row.integration,
		author_display_name: row.author_display_name,
		messages: row.messages?.map(messageToWire),
	};
}

/** Projects a message row (loaded with `messageWith`) to the Message wire shape. */
export function messageToWire(row: MessageRow): Message {
	return {
		id: row.id,
		note_id: row.note_id,
		text: row.text,
		author_id: row.author_id,
		author: row.author,
		event_code: row.event_code,
		created_at: row.created_at,
		updated_at: row.updated_at,
		integration: row.integration,
		author_display_name: row.author_display_name,
	};
}
