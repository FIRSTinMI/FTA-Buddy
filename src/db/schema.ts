import { relations, sql } from "drizzle-orm";
import {
	bigint,
	bigserial,
	boolean,
	customType,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	real,
	serial,
	text,
	timestamp,
	unique,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import type {
	EventAutoEventSettings,
	FmsNoteMetadata,
	PowerAlertSettings,
	SlowWarningSettings,
} from "../../shared/types";
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
	slowWarningSettings: jsonb("slowWarningSettings").$type<Partial<SlowWarningSettings>>().notNull().default({}),
	notepadOnly: boolean("notepadOnly").notNull().default(false),
	playoffMode: boolean("playoffMode").notNull().default(false),
	powerMonitoring: boolean("powerMonitoring").notNull().default(false),
	powerAlertSettings: jsonb("powerAlertSettings").$type<Partial<PowerAlertSettings>>().notNull().default({}),
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
		// Composite "fully connected" (DS green + radio + rIO + code). first_ready = first
		// time ever ready; last_ready = start of the final ready streak before match start;
		// time_ready = ms from prestart to last_ready (the SLOW warning's input).
		first_ready: timestamp("first_ready"),
		last_ready: timestamp("last_ready"),
		time_ready: integer("time_ready"),
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

// #region Troubleshooting (decision trees + chat assistant + knowledge corpus)
export const troubleshootSourceEnum = pgEnum("troubleshoot_source", [
	"wpilib",
	"rev",
	"ctre",
	"ni",
	"vivid",
	"ticket",
	"slack",
	"note",
]);

const tsvector = customType<{ data: string; notNull: false; default: false }>({
	dataType() {
		return "tsvector";
	},
});

// One searchable chunk of the knowledge corpus. source_key is the dedupe key:
// "<url>#<heading>" for docs, "ticket:<note id>" for tickets, "slack:<team>:<channel>:<thread ts>" for Slack.
export const troubleshootChunks = pgTable(
	"troubleshoot_chunks",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		source: troubleshootSourceEnum("source").notNull(),
		source_key: varchar("source_key").notNull().unique(),
		url: varchar("url"),
		title: varchar("title").notNull(),
		heading: varchar("heading"),
		body: text("body").notNull(),
		/** Position of this chunk within its page, so a browsable page renders in document order. */
		ordinal: integer("ordinal").notNull().default(0),
		// Redacted text only. Never store team numbers, event codes or names in body.
		tsv: tsvector("tsv").generatedAlwaysAs(
			sql`setweight(to_tsvector('english', coalesce("title", '')), 'A') || setweight(to_tsvector('english', coalesce("heading", '')), 'B') || setweight(to_tsvector('english', coalesce("body", '')), 'C')`,
		),
		source_date: timestamp("source_date"),
		fetched_at: timestamp("fetched_at").notNull().defaultNow(),
		created_at: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("troubleshoot_chunks_tsv_idx").using("gin", t.tsv),
		index("troubleshoot_chunks_source_idx").on(t.source),
		index("troubleshoot_chunks_url_idx").on(t.source, t.url, t.ordinal),
	],
);

export type TroubleshootChunk = typeof troubleshootChunks.$inferSelect;
export type TroubleshootChunkInsert = typeof troubleshootChunks.$inferInsert;

export const troubleshootRoleEnum = pgEnum("troubleshoot_role", ["user", "assistant"]);

// Chat conversations are kept forever for corpus improvement.
export const troubleshootConversations = pgTable(
	"troubleshoot_conversations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		user_id: integer("user_id")
			.references(() => users.id)
			.notNull(),
		ip: varchar("ip"),
		model: varchar("model").notNull(),
		input_tokens: integer("input_tokens").notNull().default(0),
		output_tokens: integer("output_tokens").notNull().default(0),
		cost_usd_micro: bigint("cost_usd_micro", { mode: "number" }).notNull().default(0),
		created_at: timestamp("created_at").notNull().defaultNow(),
		updated_at: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [index("troubleshoot_conversations_user_idx").on(t.user_id)],
);

export const troubleshootMessages = pgTable(
	"troubleshoot_messages",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		conversation_id: uuid("conversation_id")
			.references(() => troubleshootConversations.id)
			.notNull(),
		role: troubleshootRoleEnum("role").notNull(),
		text: text("text").notNull(),
		// Chunk ids cited by an assistant message.
		cited_chunk_ids: jsonb("cited_chunk_ids").$type<string[]>().notNull().default([]),
		/**
		 * Set when the assistant ended its turn by asking a multiple-choice
		 * question, so reopening the conversation still shows the buttons.
		 */
		question: jsonb("question").$type<import("../../shared/troubleshooting/question").ChatQuestion>(),
		created_at: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [index("troubleshoot_messages_conversation_idx").on(t.conversation_id)],
);

// One distilled troubleshooting document per Slack category (channel name). Regenerated from the
// slack chunks of that category whenever that category got new content in a poll pass.
export const troubleshootDocs = pgTable("troubleshoot_docs", {
	id: uuid("id").primaryKey().defaultRandom(),
	category: varchar("category").notNull().unique(),
	title: varchar("title").notNull(),
	body: text("body").notNull(),
	// Slack permalinks of the threads used, when the chunks carried a url.
	source_urls: jsonb("source_urls").$type<string[]>().notNull().default([]),
	thread_count: integer("thread_count").notNull().default(0),
	updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export type TroubleshootDoc = typeof troubleshootDocs.$inferSelect;

// Slack USER tokens (xoxp) from the user-scope OAuth flow. Lets the corpus poller read
// channels the signed-in person can see, in workspaces where we cannot add a bot.
export const slackUserTokens = pgTable("slack_user_tokens", {
	id: serial("id").primaryKey(),
	user_id: integer("user_id")
		.references(() => users.id)
		.notNull(),
	team_id: varchar("team_id").notNull(),
	team_name: varchar("team_name").notNull(),
	slack_user_id: varchar("slack_user_id").notNull(),
	access_token: varchar("access_token").notNull(),
	scopes: varchar("scopes").notNull().default(""),
	// Channel ids to poll. Empty = every channel the token can read.
	channels: jsonb("channels").$type<string[]>().notNull().default([]),
	last_polled_at: timestamp("last_polled_at"),
	created_at: timestamp("created_at").notNull().defaultNow(),
	updated_at: timestamp("updated_at").notNull().defaultNow(),
});

// Session (browser) tokens for a workspace where we cannot install the app: a throwaway account's
// xoxc token plus its `d` cookie. Read-only, polled with jitter. Kept out of git; set via admin only.
export const slackSessionTokens = pgTable("slack_session_tokens", {
	id: serial("id").primaryKey(),
	team_id: varchar("team_id").notNull(),
	team_name: varchar("team_name").notNull(),
	// Workspace subdomain, e.g. "myworkspace" for myworkspace.slack.com. Required for the web API URL.
	team_domain: varchar("team_domain").notNull(),
	// xoxc-... web client token.
	token: varchar("token").notNull(),
	// Value of the `d` cookie exactly as stored in the browser (xoxd-..., URL-encoded). Sent verbatim.
	cookie_d: varchar("cookie_d").notNull(),
	channels: jsonb("channels").$type<string[]>().notNull().default([]),
	last_polled_at: timestamp("last_polled_at"),
	created_at: timestamp("created_at").notNull().defaultNow(),
	updated_at: timestamp("updated_at").notNull().defaultNow(),
});
// #endregion

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
		// A card holds the alliance's driver-station assignment for BOTH sides: the
		// trio to run when they are the blue alliance and the trio when they are red
		// (station strategy can differ by side). Null = station empty / robot can't play.
		// The match's actual side (from FMS) selects which trio applies.
		blue_station1_team: integer("blue_station1_team"),
		blue_station2_team: integer("blue_station2_team"),
		blue_station3_team: integer("blue_station3_team"),
		red_station1_team: integer("red_station1_team"),
		red_station2_team: integer("red_station2_team"),
		red_station3_team: integer("red_station3_team"),
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

/**
 * Per-match "field lineup" for PRACTICE and TEST matches: which team is physically
 * in each driver station for the current/next match. Entered by a roaming volunteer
 * (any signed-in event user, walking the field) and synced live to the scorekeeper,
 * who often can't see who is going where. A null station means no robot is in that
 * station, so the scorekeeper can bypass it. Test matches are match_number 999. One
 * row per (event, level, match, play), upserted in place.
 */
export const fieldLineups = pgTable(
	"field_lineups",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		event_code: varchar("event_code")
			.references(() => events.code)
			.notNull(),
		level: levelEnum("level").notNull(),
		match_number: integer("match_number").notNull(),
		play_number: integer("play_number").notNull().default(1),
		red1_team: integer("red1_team"),
		red2_team: integer("red2_team"),
		red3_team: integer("red3_team"),
		blue1_team: integer("blue1_team"),
		blue2_team: integer("blue2_team"),
		blue3_team: integer("blue3_team"),
		updated_by_id: integer("updated_by_id").references(() => users.id),
		updated_by_name: varchar("updated_by_name"),
		updated_at: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		unique("field_lineups_event_match_uq").on(t.event_code, t.level, t.match_number, t.play_number),
		index("field_lineups_event_code_idx").on(t.event_code),
	],
);

export type FieldLineup = typeof fieldLineups.$inferSelect;

// #endregion

/**
 * Every reading from every field power monitor, at the meter's own 2 Hz. All
 * six PZEM registers are kept - volts, amps, watts, frequency, power factor and
 * the cumulative energy counter - plus its alarm flag.
 *
 * The *_min / *_max columns date from when the extension averaged each second
 * before posting. Raw samples set them to the reading itself; the history query
 * aggregates over whichever it finds, so both shapes read back correctly.
 * The extension averages the 2 Hz stream from each PZEM before posting, so an
 * eight hour event with two monitors is ~58k rows rather than 230k, and the
 * spikes that matter survive as min/max alongside the mean.
 */
export const powerSamples = pgTable(
	"power_samples",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		event: varchar("event").notNull(),
		monitor_id: varchar("monitor_id").notNull(),
		time: timestamp("time").notNull(),
		volts: real("volts").notNull(),
		volts_min: real("volts_min").notNull(),
		volts_max: real("volts_max").notNull(),
		amps: real("amps").notNull(),
		amps_max: real("amps_max").notNull(),
		watts: real("watts").notNull(),
		watts_max: real("watts_max").notNull(),
		hz: real("hz"),
		hz_min: real("hz_min"),
		/** Power factor. A leg of motors sitting at 0.6 draws far more current than its watts imply. */
		pf: real("pf"),
		pf_min: real("pf_min"),
		/** The meter's own cumulative kWh register, not an integration of watts. */
		kwh: real("kwh"),
		/** The PZEM's own over-power alarm flag, true if it fired anywhere in this second. */
		alarm: boolean("alarm").notNull().default(false),
	},
	(t) => [
		index("power_samples_event_time_idx").on(t.event, t.time),
		index("power_samples_event_monitor_time_idx").on(t.event, t.monitor_id, t.time),
	],
);

export type PowerSample = typeof powerSamples.$inferSelect;

// #region team uploads

/** What an uploaded file turned out to be. Mirrors `UploadKind` in shared/logs/detect.ts. */
export const uploadKindEnum = pgEnum("upload_kind", [
	"wpilog",
	"dslog",
	"dsevents",
	"support-bundle",
	"code-zip",
	"zip",
	"text",
	"other",
	"hoot",
	"csv",
]);

/** Where an upload came from: the public portal on a team's laptop, or a volunteer in the app. */
export const uploadSourceEnum = pgEnum("upload_source", ["portal", "app"]);

/** Ghost CSA is Limelight's SystemCore bundle analyser. We hand it a bundle and poll for the report. */
export const ghostCsaStatusEnum = pgEnum("ghost_csa_status", [
	"none",
	"queued",
	"pending",
	"running",
	"complete",
	"failed",
]);

/**
 * One submission from a team: the logs, the robot code, or a support bundle they
 * gave us, plus what we worked out about it. Teams reach this through the public
 * portal with no account, so nothing here can be trusted as identity; `team` is
 * our best inference and `team_source` says how good it is.
 */
export const teamUploads = pgTable(
	"team_uploads",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		/** Short code a team can read out over a pit wall, e.g. `7K2M-QX4T`. */
		code: varchar("code").notNull().unique(),
		/** Event this belongs to. Null when the portal was used with no event code. */
		event: varchar("event"),
		event_id: uuid("event_id"),
		team: integer("team"),
		/** `log-station`, `support-bundle`, `robot-code`, `entered` or `none`. */
		team_source: varchar("team_source").notNull().default("none"),
		/**
		 * Why this landed at this event, in a sentence, since nobody types an event
		 * code any more. Null when it could not be placed.
		 */
		event_why: varchar("event_why"),
		/**
		 * When the logs were written, from the files themselves. Kept so the event
		 * can be worked out again if the team number turns up later.
		 */
		log_date: timestamp("log_date"),
		source: uploadSourceEnum("source").notNull(),
		uploaded_by: integer("uploaded_by").references(() => users.id),
		/** Free text name from the portal. Never trusted, only displayed. */
		uploader_name: varchar("uploader_name"),
		created_at: timestamp("created_at").notNull().defaultNow(),
		/** Hashed client address, for portal rate limiting only. */
		ip_hash: varchar("ip_hash"),
		ghost_status: ghostCsaStatusEnum("ghost_status").notNull().default("none"),
		ghost_ticket: varchar("ghost_ticket"),
		ghost_analysis: text("ghost_analysis"),
		ghost_error: varchar("ghost_error"),
		ghost_updated_at: timestamp("ghost_updated_at"),
		ghost_requested_by: integer("ghost_requested_by").references(() => users.id),
	},
	(t) => [
		index("team_uploads_event_idx").on(t.event, t.created_at),
		index("team_uploads_event_team_idx").on(t.event, t.team),
		index("team_uploads_ghost_status_idx").on(t.ghost_status),
	],
);

export type TeamUpload = typeof teamUploads.$inferSelect;

/**
 * One file inside an upload. A zip is stored as the zip itself plus a row per
 * entry we extracted, linked by `parent_id`, so a CSA can open one code file
 * without downloading the archive.
 *
 * Bytes live in `content` when they are small enough for Postgres to hold
 * comfortably, otherwise in Cloud Storage at `gcs_path`. Exactly one is set.
 */
export const teamUploadFiles = pgTable(
	"team_upload_files",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		upload_id: uuid("upload_id")
			.references(() => teamUploads.id, { onDelete: "cascade" })
			.notNull(),
		/** The zip this entry came out of, null for a file uploaded on its own. */
		parent_id: uuid("parent_id"),
		/** Name as uploaded, or the entry path inside a zip. */
		path: varchar("path").notNull(),
		kind: uploadKindEnum("kind").notNull(),
		size: integer("size").notNull(),
		content: bytea("content"),
		gcs_path: varchar("gcs_path"),
		/** Decoded facts: match info, a DS log summary, robot code details. */
		meta: jsonb("meta"),
		/** Readable text for the file viewer and for prompts. Truncated. */
		text_preview: text("text_preview"),
	},
	(t) => [index("team_upload_files_upload_idx").on(t.upload_id), index("team_upload_files_kind_idx").on(t.kind)],
);

export type TeamUploadFile = typeof teamUploadFiles.$inferSelect;

/**
 * A match an uploaded log belongs to, so the FMS station log we already have can
 * sit next to the team's own log. A data log names its match outright; a Driver
 * Station log spans a session, so one file can link several matches.
 */
export const teamUploadMatches = pgTable(
	"team_upload_matches",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		upload_id: uuid("upload_id")
			.references(() => teamUploads.id, { onDelete: "cascade" })
			.notNull(),
		file_id: uuid("file_id")
			.references(() => teamUploadFiles.id, { onDelete: "cascade" })
			.notNull(),
		match_id: uuid("match_id").notNull(),
		level: levelEnum("level").notNull(),
		match_number: integer("match_number").notNull(),
		play_number: integer("play_number").notNull(),
		station: varchar("station"),
		team: integer("team"),
		/** `match-info`, `file-name` or `timestamp`. Shown so a CSA can judge the link. */
		how: varchar("how").notNull(),
		reason: varchar("reason").notNull(),
	},
	(t) => [
		unique("team_upload_matches_uq").on(t.file_id, t.match_id),
		index("team_upload_matches_upload_idx").on(t.upload_id),
		index("team_upload_matches_match_idx").on(t.match_id),
	],
);

export type TeamUploadMatch = typeof teamUploadMatches.$inferSelect;

/**
 * A link that shows part of an upload to somebody with no account, so a CSA can
 * drop it in the CSA Slack. The row id is the token in the URL. Same shape as
 * `log_publishing` for FMS station logs, with a file selection on top: only the
 * files listed in `file_ids` are readable through the token.
 */
export const teamUploadShares = pgTable(
	"team_upload_shares",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		upload_id: uuid("upload_id")
			.references(() => teamUploads.id, { onDelete: "cascade" })
			.notNull(),
		/** File ids this token may read. Empty array means every file in the upload. */
		file_ids: jsonb("file_ids").$type<string[]>().notNull().default([]),
		/** Whether the Ghost CSA report goes out with the files. */
		include_analysis: boolean("include_analysis").notNull().default(false),
		/** Whether our FMS station logs for the linked matches go out too. */
		include_fms_logs: boolean("include_fms_logs").notNull().default(false),
		/** What the sharer called it, shown on the public page. */
		label: varchar("label"),
		event: varchar("event"),
		created_by: integer("created_by").references(() => users.id),
		create_time: timestamp("create_time").notNull().defaultNow(),
		expire_time: timestamp("expire_time").notNull(),
		view_count: integer("view_count").notNull().default(0),
		revoked: boolean("revoked").notNull().default(false),
	},
	(t) => [
		index("team_upload_shares_upload_idx").on(t.upload_id),
		index("team_upload_shares_expire_idx").on(t.expire_time),
	],
);

export type TeamUploadShare = typeof teamUploadShares.$inferSelect;

export const teamUploadRelations = relations(teamUploads, ({ many, one }) => ({
	files: many(teamUploadFiles),
	matches: many(teamUploadMatches),
	shares: many(teamUploadShares),
	uploader: one(users, { fields: [teamUploads.uploaded_by], references: [users.id] }),
}));

export const teamUploadFileRelations = relations(teamUploadFiles, ({ one, many }) => ({
	upload: one(teamUploads, { fields: [teamUploadFiles.upload_id], references: [teamUploads.id] }),
	matches: many(teamUploadMatches),
}));

export const teamUploadMatchRelations = relations(teamUploadMatches, ({ one }) => ({
	upload: one(teamUploads, { fields: [teamUploadMatches.upload_id], references: [teamUploads.id] }),
	file: one(teamUploadFiles, { fields: [teamUploadMatches.file_id], references: [teamUploadFiles.id] }),
}));

export const teamUploadShareRelations = relations(teamUploadShares, ({ one }) => ({
	upload: one(teamUploads, { fields: [teamUploadShares.upload_id], references: [teamUploads.id] }),
}));

// #endregion

export default {
	events,
	users,
	eventUsers,
	playoffAlliances,
	lineupCards,
	fieldLineups,
	messages,
	noteFollowers,
	matchLogs,
	cycleLogs,
	logPublishing,
	teams,
	checklist,
};
