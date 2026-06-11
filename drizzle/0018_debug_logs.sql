CREATE TYPE "public"."log_level" AS ENUM('debug', 'info', 'warn', 'error');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "debug_log_categories" (
	"category" varchar PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "debug_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"event_code" varchar,
	"category" varchar NOT NULL,
	"level" "log_level" DEFAULT 'info' NOT NULL,
	"message" varchar NOT NULL,
	"data" jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debug_logs_timestamp_idx" ON "debug_logs" USING btree ("timestamp" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debug_logs_event_timestamp_idx" ON "debug_logs" USING btree ("event_code","timestamp" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debug_logs_category_timestamp_idx" ON "debug_logs" USING btree ("category","timestamp" DESC);
