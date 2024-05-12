CREATE TABLE IF NOT EXISTS "logPublishing" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"station" varchar NOT NULL,
	"event" varchar NOT NULL,
	"event_id" uuid NOT NULL,
	"match_number" integer NOT NULL,
	"play_number" integer NOT NULL,
	"level" "level" NOT NULL,
	"start_time" timestamp NOT NULL,
	"publish_time" timestamp DEFAULT now(),
	"published_by" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_logs" ALTER COLUMN "blue1" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "match_logs" ALTER COLUMN "blue2" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "match_logs" ALTER COLUMN "blue3" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "match_logs" ALTER COLUMN "red1" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "match_logs" ALTER COLUMN "red2" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "match_logs" ALTER COLUMN "red3" DROP NOT NULL;