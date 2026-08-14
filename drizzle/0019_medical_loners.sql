CREATE TYPE "public"."lineup_source" AS ENUM('scorekeeper', 'alliance');--> statement-breakpoint
CREATE TYPE "public"."lineup_status" AS ENUM('accepted', 'superseded', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'Scorekeeper';--> statement-breakpoint
CREATE TABLE "lineup_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_code" varchar NOT NULL,
	"alliance_number" integer NOT NULL,
	"match_number" integer NOT NULL,
	"play_number" integer DEFAULT 1 NOT NULL,
	"version" integer NOT NULL,
	"station1_team" integer,
	"station2_team" integer,
	"station3_team" integer,
	"uses_backup" boolean DEFAULT false NOT NULL,
	"status" "lineup_status" DEFAULT 'accepted' NOT NULL,
	"source" "lineup_source" DEFAULT 'scorekeeper' NOT NULL,
	"submitted_by_id" integer,
	"submitted_by_name" varchar,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"deadline_at" timestamp,
	"is_late" boolean DEFAULT false NOT NULL,
	"accepted_anyway" boolean DEFAULT false NOT NULL,
	"accepted_anyway_by_id" integer,
	"accepted_anyway_at" timestamp,
	"note" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playoff_alliances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_code" varchar NOT NULL,
	"number" integer NOT NULL,
	"captain_team" integer NOT NULL,
	"pick1_team" integer NOT NULL,
	"pick2_team" integer,
	"backup_team" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "playoff_alliances_event_number_uq" UNIQUE("event_code","number")
);
--> statement-breakpoint
ALTER TABLE "lineup_cards" ADD CONSTRAINT "lineup_cards_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "public"."events"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_cards" ADD CONSTRAINT "lineup_cards_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_cards" ADD CONSTRAINT "lineup_cards_accepted_anyway_by_id_users_id_fk" FOREIGN KEY ("accepted_anyway_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_alliances" ADD CONSTRAINT "playoff_alliances_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "public"."events"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lineup_cards_event_code_idx" ON "lineup_cards" USING btree ("event_code");--> statement-breakpoint
CREATE INDEX "lineup_cards_event_alliance_idx" ON "lineup_cards" USING btree ("event_code","alliance_number");--> statement-breakpoint
CREATE INDEX "lineup_cards_event_match_idx" ON "lineup_cards" USING btree ("event_code","match_number");--> statement-breakpoint
CREATE INDEX "playoff_alliances_event_code_idx" ON "playoff_alliances" USING btree ("event_code");