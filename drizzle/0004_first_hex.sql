DO $$ BEGIN
 CREATE TYPE "level" AS ENUM('None', 'Practice', 'Qualification', 'Playoff');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cycleLogs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event" varchar NOT NULL,
	"event_id" uuid NOT NULL,
	"match_number" integer NOT NULL,
	"play_number" integer NOT NULL,
	"level" "level" NOT NULL,
	"start_time" timestamp NOT NULL,
	"calculated_cycle_time" varchar,
	"ref_done_time" timestamp,
	"green_light_time" timestamp,
	"commit_time" timestamp
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
	"blue1" integer NOT NULL,
	"blue2" integer NOT NULL,
	"blue3" integer NOT NULL,
	"red1" integer NOT NULL,
	"red2" integer NOT NULL,
	"red3" integer NOT NULL,
	"blue1_log" jsonb DEFAULT '[]' NOT NULL,
	"blue2_log" jsonb DEFAULT '[]' NOT NULL,
	"blue3_log" jsonb DEFAULT '[]' NOT NULL,
	"red1_log" jsonb DEFAULT '[]' NOT NULL,
	"red2_log" jsonb DEFAULT '[]' NOT NULL,
	"red3_log" jsonb DEFAULT '[]' NOT NULL
);
