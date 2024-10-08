CREATE TABLE IF NOT EXISTS "analyzed_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
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
ALTER TABLE "match_logs" ADD COLUMN "analyzed" boolean DEFAULT false NOT NULL;