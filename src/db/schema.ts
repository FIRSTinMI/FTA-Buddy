import { relations } from "drizzle-orm";
import {
	bigint,
	boolean,
	customType,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { EventAutoEventSettings, FmsNoteMetadata, Profile } from "../../shared/types";
export const roleEnum = pgEnum("role", ["FTA", "FTAA", "CSA", "RI"]);

export const users = pgTable("users", {
	id: serial("id").primaryKey(),
	username: varchar("username").notNull(),
	email: varchar("email").unique().notNull(),
	password: text("password").notNull(),
	created_at: timestamp("created_at").notNull().defaultNow(),
	last_seen: timestamp("last_seen").notNull().defaultNow(),
	events: jsonb("events").notNull().default("[]"),
	role: roleEnum("role").notNull().default("FTA"),
	token: varchar("token").notNull().default(""),
	admin: boolean("admin").notNull().default(false),
	slack_user_id: varchar("slack_user_id"),
});

export type User = typeof users.$inferInsert;

export const events = pgTable("events", {
	code: varchar("code").primaryKey(),
	name: varchar("name").notNull(),
	pin: varchar("pin").notNull(),
	teams: jsonb("teams").notNull().default("[]"),
	created_at: timestamp("created_at").notNull().defaultNow(),
	token: varchar("token").notNull().default("").unique(),
	checklist: jsonb("checklist").notNull().default("[]"),
	users: jsonb("users").notNull().default("[]"),
	scheduleDetails: jsonb("scheduleDetails").notNull().default("{}"),
	archived: boolean("archived").notNull().default(false),
	meshedEvent: jsonb("meshedEvent"),
	publicTicketSubmit: boolean("publicTicketSubmit").notNull().default(true),
	slackChannel: varchar("slackChannel"),
	slackTeam: varchar("slackTeam"),
	nexusApiKey: varchar("nexusApiKey"),
	startDate: varchar("startDate"),
	endDate: varchar("endDate"),
	fmsEventPassword: varchar("fmsEventPassword"),
	autoEventSettings: jsonb("autoEventSettings").$type<EventAutoEventSettings>().notNull().default({}),
	notepadOnly: boolean("notepadOnly").notNull().default(false),
});

export type Event = typeof events.$inferInsert;

export const messages = pgTable("messages", {
	id: uuid("id").primaryKey(),
	note_id: uuid("note_id")
		.references(() => notes.id)
		.notNull(),
	text: varchar("text").notNull().default(""),
	author_id: integer("author_id")
		.references(() => users.id)
		.notNull(),
	author: jsonb("author").$type<Profile>(),
	event_code: varchar("event_code")
		.references(() => events.code)
		.notNull(),
	created_at: timestamp("created_at").notNull().defaultNow(),
	updated_at: timestamp("updated_at").notNull().defaultNow(),
	slack_ts: varchar("slack_ts"),
	slack_channel: varchar("slack_channel"),
});

export const levelEnum = pgEnum("level", ["None", "Practice", "Qualification", "Playoff"]);

export const noteTypeEnum = pgEnum("note_type", ["TeamIssue", "EventNote", "MatchNote"]);

export const resolutionStatusEnum = pgEnum("resolution_status", ["Open", "Resolved", "NotApplicable"]);

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

export const notes = pgTable("notes", {
	id: uuid("id").primaryKey(),
	text: varchar("text").notNull().default(""),
	author_id: integer("author_id")
		.references(() => users.id)
		.notNull(),
	author: jsonb("author").$type<Profile>(),
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
	assigned_to: jsonb("assigned_to").$type<Profile>(),
	followers: jsonb("followers").$type<number[]>().default([]).notNull(),
	slack_ts: varchar("slack_ts"),
	slack_channel: varchar("slack_channel"),
	match_id: uuid("match_id").references(() => matchLogs.id),
	resolved_by_id: integer("resolved_by_id").references(() => users.id),
	resolved_by: jsonb("resolved_by").$type<Profile>(),
});

export const noteMessagesRelations = relations(notes, ({ many }) => ({
	messages: many(messages),
}));

export const messageNoteRelations = relations(messages, ({ one }) => ({
	note: one(notes, { fields: [messages.note_id], references: [notes.id] }),
}));

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

export const matchLogs = pgTable("match_logs", {
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
});

export type MatchLog = typeof matchLogs.$inferInsert;

export const analyzedLogs = pgTable("analyzed_logs", {
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
});

export const cycleLogs = pgTable("cycle_logs", {
	id: uuid("id").primaryKey(),
	event: varchar("event").notNull(),
	match_number: integer("match_number").notNull(),
	play_number: integer("play_number").notNull(),
	level: levelEnum("level").notNull(),
	prestart_time: timestamp("prestart_time"),
	start_time: timestamp("start_time"),
	calculated_cycle_time: varchar("calculated_cycle_time"),
	ref_done_time: timestamp("ref_done_time"),
	scores_posted_time: timestamp("scores_posted_time"),
	end_time: timestamp("end_time"),
});

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

export const robotCycleLogs = pgTable("team_cycle_logs", {
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
});

export type RobotCycleLog = typeof robotCycleLogs.$inferInsert;

export const matchEventStatusEnum = pgEnum("match_event_status", ["active", "dismissed", "converted"]);

export const matchEvents = pgTable("match_events", {
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
});

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
	team_id: varchar("team_id").notNull(),
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

export default { events, users, messages, matchLogs, cycleLogs, logPublishing };
