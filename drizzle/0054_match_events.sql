-- Create the match_event_status enum
CREATE TYPE "public"."match_event_status" AS ENUM('active', 'dismissed', 'converted');--> statement-breakpoint

-- Create the match_events table
CREATE TABLE "match_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"event_code" varchar NOT NULL,
	"team" integer NOT NULL,
	"alliance" varchar NOT NULL,
	"issue" "issue" NOT NULL,
	"match_number" integer NOT NULL,
	"play_number" integer NOT NULL,
	"level" "level" NOT NULL,
	"start_time" integer,
	"end_time" integer,
	"duration" integer,
	"status" "match_event_status" DEFAULT 'active' NOT NULL,
	"converted_note_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Add foreign keys for match_events
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_match_logs_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "public"."events"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_converted_note_id_notes_id_fk" FOREIGN KEY ("converted_note_id") REFERENCES "public"."notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Add autoEventSettings column to events table (defaults to empty JSON object, meaning all issues enabled)
ALTER TABLE "events" ADD COLUMN "autoEventSettings" jsonb DEFAULT '{}' NOT NULL;
