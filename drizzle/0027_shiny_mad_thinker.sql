ALTER TABLE "messages" ADD COLUMN "author" jsonb;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "author" jsonb;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "author" jsonb;