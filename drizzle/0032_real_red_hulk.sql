ALTER TABLE "messages" ALTER COLUMN "ticket_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "author_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "assigned_to_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "assigned_to_id" DROP NOT NULL;