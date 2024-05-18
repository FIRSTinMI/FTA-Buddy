ALTER TABLE "cycle_logs" RENAME COLUMN "green_light_time" TO "prestart_time";--> statement-breakpoint
ALTER TABLE "cycle_logs" RENAME COLUMN "commit_time" TO "scores_posted_time";--> statement-breakpoint
ALTER TABLE "cycle_logs" ALTER COLUMN "start_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cycle_logs" ADD COLUMN "end_time" timestamp;--> statement-breakpoint
ALTER TABLE "cycle_logs" DROP COLUMN IF EXISTS "event_id";