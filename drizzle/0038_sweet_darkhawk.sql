DROP TABLE "debug_log_categories" CASCADE;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "extensionsEnabled" boolean DEFAULT true NOT NULL;