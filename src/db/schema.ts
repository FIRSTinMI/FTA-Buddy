import { relations } from "drizzle-orm";
import {
	bigint,
	boolean,
	customType,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	unique,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import type { EventAutoEventSettings, FmsNoteMetadata } from "../../shared/types";
export const roleEnum = pgEnum("role", ["FTA", "FTAA", "CSA", "RI", "System", "Scorekeeper"]);

export const users = pgTable(
	"users",
	{
		id: serial("id").primaryKey(),
		username: varchar("username").notNull(),
		email: varchar("email").unique().notNull(),
		// Firebase Auth UID. Source of truth for authentication; the password/token
		// columns below are deprecated and retained only for the migration window.
		firebase_uid: varchar("firebase_uid").unique(),
		// @deprecated Legacy bcrypt hash. No longer written; auth lives in Firebase.
		password: text("password"),
		created_at: timestamp("created_at").notNull().defaultNow(),
		last_seen: timestamp("last_seen").notNull().defaultNow(),
		role: roleEnum("role").notNull().default("FTA"),
		// @deprecated Legacy homegrown session token. Auth now uses Firebase ID tokens.
		token: varchar("token").notNull().default(""),
		admin: boolean("admin").notNull().default(false),
		slack_user_id: varchar("slack_user_id"),
		active_event_code: varchar("active_event_code"),
	},
	(t) => [index("users_token_idx").on(t.token)],
);

export type User = typeof users.$inferInsert;

export const events = pgTable("events", {
	code: varchar("code").primaryKey(),
	name: varchar("name").notNull(),
	pin: varchar("pin").notNull(),
	created_at: timestamp("created_at").notNull().defaultNow(),
	token: varchar("token").notNull().default("").unique(),
	scheduleDetails: jsonb("scheduleDetails").notNull().default("{}"),
	archived: boolean("archived").notNull().default(false),
	meshedEvent: jsonb("meshedEvent"),
	publicTicketSubmit: boolean("publicTicketSubmit").notNull().default(true),
	slackChannel: varchar("slackChannel"),
	slackTeam: varchar("slackTeam"),
	nexusApiKey: varchar("nexusApiKey"),
	startDate: varchar("startDate"),
	endDate: varchar("endDate"),
	timezone: varchar("timezone"),
	fmsEventPassword: varchar("fmsEventPassword"),
	autoEventSettings: jsonb("autoEventSettings").$type<EventAutoEventSettings>().notNull().default({}),
	notepadOnly: boolean("notepadOnly").notNull().default(false),
	playoffMode: boolean("playoffMode").notNull().default(false),
});

export type Event = typeof events.$inferInsert;

/** Global team registry — upserted whenever an event is created or teams imported. */
export const teams = pgTable("teams", {
	number: text("number").primaryKey(),
	name: text("name").notNull().default(""),
});

export type Team = typeof teams.$inferInsert;

/** Per-event team checklist — one row per (event, team). Doubles as the team roster for the event. */
export const checklist = pgTable(
	"checklist",
	{
		eventCode: text("event_code")
			.notNull()
			.references(() => events.code),
		teamNumber: text("team_number")
			.notNull()
			.references(() => teams.number),
		present: boolean("present").notNull().default(false),
		inspected: boolean("inspected").notNull().default(false),
		radioProgrammed: boolean("radio_programmed").notNull().default(false),
		connectionTested: boolean("connection_tested").notNull().default(false),
	},
	(t) => [primaryKey({ columns: [t.eventCode, t.teamNumber] })],
);

export type ChecklistRow = typeof checklist.$inferSelect;

export const eventUsers = pgTable(
	"event_users",
	{
		user_id: integer("user_id")
			.references(() => users.id)
			.notNull(),
		event_code: varchar("event_code")
			.references(() => events.code)
			.notNull(),
	},
	(t) => [primaryKey({ columns: [t.user_id, t.event_code] }), index("event_users_event_code_idx").on(t.event_code)],
);

export const integrationEnum = pgEnum("integration", ["Slack", "FMS"]);

export const messages = pgTable("messages", {
	id: uuid("id").primaryKey(),
	note_id: uuid("note_id")
		.references(() => notes.id)
		.notNull(),
	text: varchar("text").notNull().default(""),
	author_id: integer("author_id")
		.references(() => users.id)
		.notNull(),
	event_code: varchar("event_code")
		.references(() => events.code)
		.notNull(),
	created_at: timestamp("created_at").notNull().defaultNow(),
	updated_at: timestamp("updated_at").notNull().defaultNow(),
	slack_ts: varchar("slack_ts"),
	slack_channel: varchar("slack_channel"),
	integration: integrationEnum("integration"),
	author_display_name: varchar("author_display_name"),
});

export const levelEnum = pgEnum("level", ["None", "Practice", "Qualification", "Playoff"]);

export const noteTypeEnum = pgEnum("note_type", ["TeamIssue", "EventNote", "MatchNote"]);

export const resolutionStatusEnum = pgEnum("resolution_status", ["Open", "Resolved", "NotApplicable", "Refused"]);

export const noteIssueTypeEnum = pgEnum("note_issue_type", [
	"RoboRioIssue",
	"DSIssue",
	"NoRobot",
	"RadioIssue",
	"RobotPwrIssue",
	"OtherRobotIssue",
	"VenueIssue",
	"ElectricalIssue",
	"MechanicalIssue",
	"VolunteerIssue",
	"Other",
]);

export const noteRequestTypeEnum = pgEnum("note_request_type", ["CSA", "RI"]);

export const notes = pgTable(
	"notes",
	{
		id: uuid("id").primaryKey(),
		text: varchar("text").notNull().default(""),
		author_id: integer("author_id")
			.references(() => users.id)
			.notNull(),
		team: integer("team"),
		note_type: noteTypeEnum("note_type").notNull().default("TeamIssue"),
		resolution_status: resolutionStatusEnum("resolution_status").default("NotApplicable"),
		issue_type: noteIssueTypeEnum("issue_type"),
		match_number: integer("match_number"),
		play_number: integer("play_number"),
		tournament_level: levelEnum("tournament_level"),
		fms_note_id: varchar("fms_note_id").unique(),
		fms_record_version: bigint("fms_record_version", { mode: "number" }),
		fms_metadata: jsonb("fms_metadata").$type<FmsNoteMetadata>(),
		event_code: varchar("event_code")
			.references(() => events.code)
			.notNull(),
		created_at: timestamp("created_at").notNull().defaultNow(),
		updated_at: timestamp("updated_at").notNull().defaultNow(),
		closed_at: timestamp("closed_at"),
		assigned_to_id: integer("assigned_to_id").references(() => users.id),
		slack_ts: varchar("slack_ts"),
		slack_channel: varchar("slack_channel"),
		match_id: uuid("match_id").references(() => matchLogs.id),
		resolved_by_id: integer("resolved_by_id").references(() => users.id),
		request_type: noteRequestTypeEnum("request_type"),
		is_nexus: boolean("is_nexus").notNull().default(false),
		merged_into: uuid("merged_into"),
		integration: integrationEnum("integration"),
		author_display_name: varchar("author_display_name"),
	},
	(t) => [
		index("notes_event_code_idx").on(t.event_code),
		index("notes_event_code_team_idx").on(t.event_code, t.team),
		index("notes_event_code_created_at_idx").on(t.event_code, t.created_at),
	],
);

export const usersRelations = relations(users, ({ many }) => ({
	authoredNotes: many(notes, { relationName: "noteAuthor" }),
	assignedNotes: many(notes, { relationName: "noteAssignedTo" }),
	resolvedNotes: many(notes, { relationName: "noteResolvedBy" }),
	authoredMessages: many(messages, { relationName: "messageAuthor" }),
}));

export const noteMessagesRelations = relations(notes, ({ many, one }) => ({
	messages: many(messages),
	author: one(users, { fields: [notes.author_id], references: [users.id], relationName: "noteAuthor" }),
	assigned_to: one(users, {
		fields: [notes.assigned_to_id],
		references: [users.id],
		relationName: "noteAssignedTo",
	}),
	resolved_by: one(users, {
		fields: [notes.resolved_by_id],
		references: [users.id],
		relationName: "noteResolvedBy",
	}),
}));

export const messageNoteRelations = relations(messages, ({ one }) => ({
	note: one(notes, { fields: [messages.note_id], references: [notes.id] }),
	author: one(users, { fields: [messages.author_id], references: [users.id], relationName: "messageAuthor" }),
}));

export const noteFollowers = pgTable(
	"note_followers",
	{
		note_id: uuid("note_id")
			.references(() => notes.id, { onDelete: "cascade" })
			.notNull(),
		user_id: integer("user_id")
			.references(() => users.id)
			.notNull(),
	},
	(t) => [primaryKey({ columns: [t.note_id, t.user_id] }), index("note_followers_note_id_idx").on(t.note_id)],
);

export const issueEnum = pgEnum("issue", [
	"Bypassed",
	"Code disconnect",
	"RIO disconnect",
	"Radio disconnect",
	"DS disconnect",
	"Brownout",
	"Large spike in ping",
	"Sustained high ping",
	"Low signal",
	"High BWU",
]);

const bytea = customType<{ data: string; notNull: false; default: false }>({
	dataType() {
		return "bytea";
	},
	toDriver(val) {
		return Buffer.from(val, "base64");
	},
	fromDriver(val) {
		return (val as Buffer).toString("base64");
	},
});

export const matchLogs = pgTable(
	"match_logs",
	{
		id: uuid("id").primaryKey(),
		event: varchar("event").notNull(),
		event_id: uuid("event_id").notNull(),
		match_number: integer("match_number").notNull(),
		play_number: integer("play_number").notNull(),
		level: levelEnum("level").notNull(),
		start_time: timestamp("start_time").notNull(),
		blue1: integer("blue1"),
		blue2: integer("blue2"),
		blue3: integer("blue3"),
		red1: integer("red1"),
		red2: integer("red2"),
		red3: integer("red3"),
		blue1_log: bytea("blue1_log"),
		blue2_log: bytea("blue2_log"),
		blue3_log: bytea("blue3_log"),
		red1_log: bytea("red1_log"),
		red2_log: bytea("red2_log"),
		red3_log: bytea("red3_log"),
		analyzed: boolean("analyzed").notNull().default(false),
	},
	(t) => [
		index("match_logs_event_idx").on(t.event),
		index("match_logs_event_analyzed_idx").on(t.event, t.analyzed),
		index("match_logs_event_match_idx").on(t.event, t.match_number, t.play_number),
	],
);

export type MatchLog = typeof matchLogs.$inferInsert;

export const analyzedLogs = pgTable(
	"analyzed_logs",
	{
		id: uuid("id").primaryKey(),
		match_id: uuid("match_id")
			.references(() => matchLogs.id)
			.notNull(),
		event: varchar("event").notNull(),
		match_number: integer("match_number").notNull(),
		play_number: integer("play_number").notNull(),
		level: levelEnum("level").notNull(),
		team: integer("team").notNull(),
		alliance: varchar("alliance").notNull(),
		issue: issueEnum("issue").notNull(),
		start_time: integer("start_time"),
		end_time: integer("end_time"),
		duration: integer("duration"),
		start_index: integer("start_index"),
		end_index: integer("end_index"),
	},
	(t) => [index("analyzed_logs_event_idx").on(t.event)],
);

export const cycleLogs = pgTable(
	"cycle_logs",
	{
		id: uuid("id").primaryKey(),
		event: varchar("event").notNull(),
		match_number: integer("match_number").notNull(),
		play_number: integer("play_number").notNull(),
		level: levelEnum("level").notNull(),
		prestart_time: timestamp("prestart_time"),
		match_ready_time: timestamp("match_ready_time"),
		start_time: timestamp("start_time"),
		calculated_cycle_time: varchar("calculated_cycle_time"),
		ref_done_time: timestamp("ref_done_time"),
		scores_posted_time: timestamp("scores_posted_time"),
		end_time: timestamp("end_time"),
	},
	(t) => [index("cycle_logs_event_idx").on(t.event)],
);

export type CycleLog = typeof cycleLogs.$inferSelect;

export const logPublishing = pgTable("log_publishing", {
	id: uuid("id").primaryKey(),
	team: integer("team").notNull(),
	match_id: uuid("match_id").notNull(),
	station: varchar("station").notNull(),
	event: varchar("event").notNull(),
	event_id: uuid("event_id").notNull(),
	match_number: integer("match_number").notNull(),
	play_number: integer("play_number").notNull(),
	level: levelEnum("level").notNull(),
	start_time: timestamp("start_time").notNull(),
	publish_time: timestamp("publish_time").defaultNow(),
	expire_time: timestamp("expire_time").notNull(),
});

export const robotCycleLogs = pgTable(
	"team_cycle_logs",
	{
		id: uuid("id").primaryKey(),
		event: varchar("event").notNull(),
		match_number: integer("match_number").notNull(),
		play_number: integer("play_number").notNull(),
		level: levelEnum("level").notNull(),
		team: integer("team").notNull(),
		prestart: timestamp("prestart"),
		first_ds: timestamp("first_ds"),
		last_ds: timestamp("last_ds"),
		time_ds: integer("time_ds"),
		first_radio: timestamp("first_radio"),
		last_radio: timestamp("last_radio"),
		time_radio: integer("time_radio"),
		first_rio: timestamp("first_rio"),
		last_rio: timestamp("last_rio"),
		time_rio: integer("time_rio"),
		first_code: timestamp("first_code"),
		last_code: timestamp("last_code"),
		time_code: integer("time_code"),
	},
	(t) => [index("robot_cycle_logs_event_idx").on(t.event)],
);

export type RobotCycleLog = typeof robotCycleLogs.$inferInsert;

export const matchEventStatusEnum = pgEnum("match_event_status", ["active", "dismissed", "converted"]);

export const matchEvents = pgTable(
	"match_events",
	{
		id: uuid("id").primaryKey(),
		match_id: uuid("match_id")
			.references(() => matchLogs.id)
			.notNull(),
		event_code: varchar("event_code")
			.references(() => events.code)
			.notNull(),
		team: integer("team").notNull(),
		alliance: varchar("alliance").notNull(),
		issue: issueEnum("issue").notNull(),
		issues: jsonb("issues").$type<import("../../shared/types").MatchEventIssueDetail[]>(),
		match_number: integer("match_number").notNull(),
		play_number: integer("play_number").notNull(),
		level: levelEnum("level").notNull(),
		start_time: integer("start_time"),
		end_time: integer("end_time"),
		duration: integer("duration"),
		status: matchEventStatusEnum("status").notNull().default("active"),
		converted_note_id: uuid("converted_note_id").references(() => notes.id),
		created_at: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("match_events_event_code_idx").on(t.event_code),
		index("match_events_event_code_status_idx").on(t.event_code, t.status),
	],
);

export type MatchEvent = typeof matchEvents.$inferSelect;

export const aiReportStatusEnum = pgEnum("ai_report_status", ["pending", "generating", "ready", "error"]);

export const aiEventReports = pgTable("ai_event_reports", {
	id: uuid("id").primaryKey(),
	event_code: varchar("event_code")
		.references(() => events.code)
		.notNull()
		.unique(),
	status: aiReportStatusEnum("status").notNull().default("pending"),
	file_path: varchar("file_path"),
	error_message: varchar("error_message"),
	generation_count: integer("generation_count").notNull().default(0),
	created_at: timestamp("created_at").notNull().defaultNow(),
	completed_at: timestamp("completed_at"),
});

export type AiEventReport = typeof aiEventReports.$inferSelect;

export const pushSubscriptions = pgTable("push_subscriptions", {
	id: serial("id").primaryKey(),
	user_id: serial("user_id")
		.references(() => users.id)
		.notNull(),
	endpoint: text("endpoint").notNull(),
	expirationTime: timestamp("expirationTime"),
	keys: jsonb("keys").notNull(),
});

export const slackServers = pgTable("slack_servers", {
	id: serial("id").primaryKey(),
	team_id: varchar("team_id").notNull().unique(),
	team_name: varchar("team_name").notNull(),
	access_token: varchar("access_token").notNull(),
	webhook_url: varchar("webhook_url"),
});

export const appTelemetry = pgTable("app_telemetry", {
	id: uuid("id").primaryKey().defaultRandom(),
	event_type: varchar("event_type", { length: 50 }).notNull(),
	event_code: varchar("event_code"),
	metadata: jsonb("metadata"),
	created_at: timestamp("created_at").notNull().defaultNow(),
});

export const slackLinkTokens = pgTable("slack_link_tokens", {
	id: serial("id").primaryKey(),
	token: varchar("token").notNull().unique(),
	slack_user_id: varchar("slack_user_id").notNull(),
	team_id: varchar("team_id").notNull(),
	channel_id: varchar("channel_id").notNull(),
	expires_at: timestamp("expires_at").notNull(),
});

export const logLevelEnum = pgEnum("log_level", ["debug", "info", "warn", "error"]);

/**
 * Persistent toggle for which app sections emit debug logs. The util reads
 * this through an in-memory cache (5s refresh) so calls on hot paths are
 * essentially free when disabled. Categories are arbitrary strings — call
 * sites can use whatever name fits and the admin page picks them up.
 */
export const debugLogCategories = pgTable("debug_log_categories", {
	category: varchar("category").primaryKey(),
	enabled: boolean("enabled").notNull().default(false),
	updated_at: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * General-purpose debug log table. Capped at 100k rows by a background
 * pruner — old entries are deleted, not rotated. Filter by event_code,
 * category, level, time range, or free-text on message via the admin page.
 */
export const debugLogs = pgTable(
	"debug_logs",
	{
		id: uuid("id").primaryKey(),
		timestamp: timestamp("timestamp").notNull().defaultNow(),
		event_code: varchar("event_code"),
		category: varchar("category").notNull(),
		level: logLevelEnum("level").notNull().default("info"),
		message: varchar("message").notNull(),
		data: jsonb("data"),
	},
	(t) => [
		index("debug_logs_timestamp_idx").on(t.timestamp.desc()),
		index("debug_logs_event_timestamp_idx").on(t.event_code, t.timestamp.desc()),
		index("debug_logs_category_timestamp_idx").on(t.category, t.timestamp.desc()),
	],
);

// #region Scorekeeper view (playoff lineups)

/** One row per playoff alliance per event. The roster a lineup draws from. */
export const playoffAlliances = pgTable(
	"playoff_alliances",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		event_code: varchar("event_code")
			.references(() => events.code)
			.notNull(),
		// 1..8, by qualification rank (10.6.1 REBUILT).
		number: integer("number").notNull(),
		// ALLIANCE Lead / captain.
		captain_team: integer("captain_team").notNull(),
		// 1st selected pick.
		pick1_team: integer("pick1_team").notNull(),
		// 2nd selected pick (nullable only for degenerate 2-team alliances).
		pick2_team: integer("pick2_team"),
		// Set when a backup coupon is accepted (10.6.3). Makes the alliance 4 teams.
		backup_team: integer("backup_team"),
		created_at: timestamp("created_at").notNull().defaultNow(),
		updated_at: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		unique("playoff_alliances_event_number_uq").on(t.event_code, t.number),
		index("playoff_alliances_event_code_idx").on(t.event_code),
	],
);

export type PlayoffAlliance = typeof playoffAlliances.$inferSelect;

export const lineupStatusEnum = pgEnum("lineup_status", ["accepted", "superseded", "rejected"]);
export const lineupSourceEnum = pgEnum("lineup_source", ["scorekeeper", "alliance"]);

/**
 * Versioned lineup cards. Each submission for a given (event, alliance, match)
 * inserts a new row with an incremented version; the prior accepted row for that
 * key is flipped to `superseded`. `rejected` records a denied late card (T613).
 */
export const lineupCards = pgTable(
	"lineup_cards",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		event_code: varchar("event_code")
			.references(() => events.code)
			.notNull(),
		// The alliance (1..8) this lineup is for.
		alliance_number: integer("alliance_number").notNull(),
		// The target playoff match this lineup applies to.
		match_number: integer("match_number").notNull(),
		play_number: integer("play_number").notNull().default(1),
		// 1-based, per (event, alliance, match).
		version: integer("version").notNull(),
		// Team assigned to each DRIVER STATION. Null = station empty (robot cannot play).
		station1_team: integer("station1_team"),
		station2_team: integer("station2_team"),
		station3_team: integer("station3_team"),
		uses_backup: boolean("uses_backup").notNull().default(false),
		status: lineupStatusEnum("status").notNull().default("accepted"),
		source: lineupSourceEnum("source").notNull().default("scorekeeper"),
		submitted_by_id: integer("submitted_by_id").references(() => users.id),
		submitted_by_name: varchar("submitted_by_name"),
		submitted_at: timestamp("submitted_at").notNull().defaultNow(),
		// Computed T613 deadline at submit time (expected start - 2 min). Null when unknown.
		deadline_at: timestamp("deadline_at"),
		is_late: boolean("is_late").notNull().default(false),
		accepted_anyway: boolean("accepted_anyway").notNull().default(false),
		accepted_anyway_by_id: integer("accepted_anyway_by_id").references(() => users.id),
		accepted_anyway_at: timestamp("accepted_anyway_at"),
		note: varchar("note"),
		created_at: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("lineup_cards_event_code_idx").on(t.event_code),
		index("lineup_cards_event_alliance_idx").on(t.event_code, t.alliance_number),
		index("lineup_cards_event_match_idx").on(t.event_code, t.match_number),
	],
);

export type LineupCard = typeof lineupCards.$inferSelect;

// #endregion

export default {
	events,
	users,
	eventUsers,
	playoffAlliances,
	lineupCards,
	messages,
	noteFollowers,
	matchLogs,
	cycleLogs,
	logPublishing,
	teams,
	checklist,
};
