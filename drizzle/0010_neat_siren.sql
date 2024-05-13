ALTER TABLE "events" ADD COLUMN "checklist" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "users" jsonb DEFAULT '[]' NOT NULL;