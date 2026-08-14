CREATE TABLE "field_lineups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_code" varchar NOT NULL,
	"level" "level" NOT NULL,
	"match_number" integer NOT NULL,
	"play_number" integer DEFAULT 1 NOT NULL,
	"red1_team" integer,
	"red2_team" integer,
	"red3_team" integer,
	"blue1_team" integer,
	"blue2_team" integer,
	"blue3_team" integer,
	"updated_by_id" integer,
	"updated_by_name" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "field_lineups_event_match_uq" UNIQUE("event_code","level","match_number","play_number")
);
--> statement-breakpoint
ALTER TABLE "field_lineups" ADD CONSTRAINT "field_lineups_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "public"."events"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_lineups" ADD CONSTRAINT "field_lineups_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "field_lineups_event_code_idx" ON "field_lineups" USING btree ("event_code");