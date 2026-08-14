ALTER TABLE "events" ADD COLUMN "slowWarningSettings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "team_cycle_logs" ADD COLUMN "first_ready" timestamp;--> statement-breakpoint
ALTER TABLE "team_cycle_logs" ADD COLUMN "last_ready" timestamp;--> statement-breakpoint
ALTER TABLE "team_cycle_logs" ADD COLUMN "time_ready" integer;