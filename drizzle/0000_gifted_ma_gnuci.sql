DO $$ BEGIN
 CREATE TYPE "level" AS ENUM('None', 'Practice', 'Qualification', 'Playoff');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "role" AS ENUM('FTA', 'FTAA', 'CSA', 'RI');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analyzed_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"event" varchar NOT NULL,
	"match_number" integer NOT NULL,
	"play_number" integer NOT NULL,
	"level" "level" NOT NULL,
	"team" integer NOT NULL,
	"alliance" varchar NOT NULL,
	"events" jsonb DEFAULT '[]' NOT NULL,
	"bypassed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cycle_logs" (
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
CREATE TABLE IF NOT EXISTS "events" (
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
	CONSTRAINT "events_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "log_publishing" (
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
CREATE TABLE IF NOT EXISTS "match_logs" (
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
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
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
CREATE TABLE IF NOT EXISTS "notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"text" varchar DEFAULT '' NOT NULL,
	"author_id" integer NOT NULL,
	"author" jsonb,
	"team" integer DEFAULT -1 NOT NULL,
	"event_code" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" serial NOT NULL,
	"endpoint" text NOT NULL,
	"expirationTime" timestamp,
	"keys" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_cycle_logs" (
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
CREATE TABLE IF NOT EXISTS "slack_servers" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" varchar NOT NULL,
	"team_name" varchar NOT NULL,
	"access_token" varchar NOT NULL,
	"webhook_url" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"team" integer DEFAULT -1 NOT NULL,
	"subject" varchar DEFAULT '' NOT NULL,
	"author_id" integer NOT NULL,
	"author" jsonb,
	"assigned_to_id" integer,
	"assigned_to" jsonb,
	"event_code" varchar NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"text" varchar DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"match_id" uuid,
	"followers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"slack_ts" varchar,
	"slack_channel" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
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
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analyzed_logs" ADD CONSTRAINT "analyzed_logs_match_id_match_logs_id_fk" FOREIGN KEY ("match_id") REFERENCES "match_logs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "events"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notes" ADD CONSTRAINT "notes_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "events"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "events"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_match_id_match_logs_id_fk" FOREIGN KEY ("match_id") REFERENCES "match_logs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
