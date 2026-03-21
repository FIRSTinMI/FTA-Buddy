CREATE TYPE "public"."ai_report_status" AS ENUM('pending', 'generating', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."issue" AS ENUM('Bypassed', 'Code disconnect', 'RIO disconnect', 'Radio disconnect', 'DS disconnect', 'Brownout', 'Large spike in ping', 'Sustained high ping', 'Low signal', 'High BWU');--> statement-breakpoint
CREATE TYPE "public"."level" AS ENUM('None', 'Practice', 'Qualification', 'Playoff');--> statement-breakpoint
CREATE TYPE "public"."match_event_status" AS ENUM('active', 'dismissed', 'converted');--> statement-breakpoint
CREATE TYPE "public"."note_issue_type" AS ENUM('RoboRioIssue', 'DSIssue', 'NoRobot', 'RadioIssue', 'RobotPwrIssue', 'OtherRobotIssue', 'VenueIssue', 'ElectricalIssue', 'MechanicalIssue', 'VolunteerIssue', 'Other');--> statement-breakpoint
CREATE TYPE "public"."note_type" AS ENUM('TeamIssue', 'EventNote', 'MatchNote');--> statement-breakpoint
CREATE TYPE "public"."resolution_status" AS ENUM('Open', 'Resolved', 'NotApplicable');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('FTA', 'FTAA', 'CSA', 'RI');--> statement-breakpoint
CREATE TABLE "ai_event_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_code" varchar NOT NULL,
	"status" "ai_report_status" DEFAULT 'pending' NOT NULL,
	"file_path" varchar,
	"error_message" varchar,
	"generation_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "ai_event_reports_event_code_unique" UNIQUE("event_code")
);
--> statement-breakpoint
CREATE TABLE "analyzed_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"event" varchar NOT NULL,
	"match_number" integer NOT NULL,
	"play_number" integer NOT NULL,
	"level" "level" NOT NULL,
	"team" integer NOT NULL,
	"alliance" varchar NOT NULL,
	"issue" "issue" NOT NULL,
	"start_time" integer,
	"end_time" integer,
	"duration" integer,
	"start_index" integer,
	"end_index" integer
);
--> statement-breakpoint
CREATE TABLE "app_telemetry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"event_code" varchar,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cycle_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event" varchar NOT NULL,
	"match_number" integer NOT NULL,
	"play_number" integer NOT NULL,
	"level" "level" NOT NULL,
	"prestart_time" timestamp,
	"start_time" timestamp,
	"calculated_cycle_time" varchar,
	"ref_done_time" timestamp,
	"scores_posted_time" timestamp,
	"end_time" timestamp
);
--> statement-breakpoint
CREATE TABLE "events" (
	"code" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"pin" varchar NOT NULL,
	"teams" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"token" varchar DEFAULT '' NOT NULL,
	"checklist" jsonb DEFAULT '[]' NOT NULL,
	"users" jsonb DEFAULT '[]' NOT NULL,
	"scheduleDetails" jsonb DEFAULT '{}' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"meshedEvent" jsonb,
	"publicTicketSubmit" boolean DEFAULT true NOT NULL,
	"slackChannel" varchar,
	"slackTeam" varchar,
	"nexusApiKey" varchar,
	"startDate" varchar,
	"endDate" varchar,
	"fmsEventPassword" varchar,
	"autoEventSettings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notepadOnly" boolean DEFAULT false NOT NULL,
	CONSTRAINT "events_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "log_publishing" (
	"id" uuid PRIMARY KEY NOT NULL,
	"team" integer NOT NULL,
	"match_id" uuid NOT NULL,
	"station" varchar NOT NULL,
	"event" varchar NOT NULL,
	"event_id" uuid NOT NULL,
	"match_number" integer NOT NULL,
	"play_number" integer NOT NULL,
	"level" "level" NOT NULL,
	"start_time" timestamp NOT NULL,
	"publish_time" timestamp DEFAULT now(),
	"expire_time" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"event_code" varchar NOT NULL,
	"team" integer NOT NULL,
	"alliance" varchar NOT NULL,
	"issue" "issue" NOT NULL,
	"issues" jsonb,
	"match_number" integer NOT NULL,
	"play_number" integer NOT NULL,
	"level" "level" NOT NULL,
	"start_time" integer,
	"end_time" integer,
	"duration" integer,
	"status" "match_event_status" DEFAULT 'active' NOT NULL,
	"converted_note_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event" varchar NOT NULL,
	"event_id" uuid NOT NULL,
	"match_number" integer NOT NULL,
	"play_number" integer NOT NULL,
	"level" "level" NOT NULL,
	"start_time" timestamp NOT NULL,
	"blue1" integer,
	"blue2" integer,
	"blue3" integer,
	"red1" integer,
	"red2" integer,
	"red3" integer,
	"blue1_log" "bytea",
	"blue2_log" "bytea",
	"blue3_log" "bytea",
	"red1_log" "bytea",
	"red2_log" "bytea",
	"red3_log" "bytea",
	"analyzed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"note_id" uuid NOT NULL,
	"text" varchar DEFAULT '' NOT NULL,
	"author_id" integer NOT NULL,
	"author" jsonb,
	"event_code" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"slack_ts" varchar,
	"slack_channel" varchar
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"text" varchar DEFAULT '' NOT NULL,
	"author_id" integer NOT NULL,
	"author" jsonb,
	"team" integer,
	"note_type" "note_type" DEFAULT 'TeamIssue' NOT NULL,
	"resolution_status" "resolution_status" DEFAULT 'NotApplicable',
	"issue_type" "note_issue_type",
	"match_number" integer,
	"play_number" integer,
	"tournament_level" "level",
	"fms_note_id" varchar,
	"fms_record_version" bigint,
	"fms_metadata" jsonb,
	"event_code" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"assigned_to_id" integer,
	"assigned_to" jsonb,
	"followers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"slack_ts" varchar,
	"slack_channel" varchar,
	"match_id" uuid,
	"resolved_by_id" integer,
	"resolved_by" jsonb,
	CONSTRAINT "notes_fms_note_id_unique" UNIQUE("fms_note_id")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" serial NOT NULL,
	"endpoint" text NOT NULL,
	"expirationTime" timestamp,
	"keys" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_cycle_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event" varchar NOT NULL,
	"match_number" integer NOT NULL,
	"play_number" integer NOT NULL,
	"level" "level" NOT NULL,
	"team" integer NOT NULL,
	"prestart" timestamp,
	"first_ds" timestamp,
	"last_ds" timestamp,
	"time_ds" integer,
	"first_radio" timestamp,
	"last_radio" timestamp,
	"time_radio" integer,
	"first_rio" timestamp,
	"last_rio" timestamp,
	"time_rio" integer,
	"first_code" timestamp,
	"last_code" timestamp,
	"time_code" integer
);
--> statement-breakpoint
CREATE TABLE "slack_servers" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" varchar NOT NULL,
	"team_name" varchar NOT NULL,
	"access_token" varchar NOT NULL,
	"webhook_url" varchar
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar NOT NULL,
	"email" varchar NOT NULL,
	"password" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"events" jsonb DEFAULT '[]' NOT NULL,
	"role" "role" DEFAULT 'FTA' NOT NULL,
	"token" varchar DEFAULT '' NOT NULL,
	"admin" boolean DEFAULT false NOT NULL,
	"slack_user_id" varchar,
	"active_event_code" varchar,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ai_event_reports" ADD CONSTRAINT "ai_event_reports_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "public"."events"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyzed_logs" ADD CONSTRAINT "analyzed_logs_match_id_match_logs_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_match_logs_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "public"."events"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_converted_note_id_notes_id_fk" FOREIGN KEY ("converted_note_id") REFERENCES "public"."notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "public"."events"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "public"."events"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_match_id_match_logs_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;