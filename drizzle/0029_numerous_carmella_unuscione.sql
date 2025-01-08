ALTER TABLE "tickets" ALTER COLUMN "assigned_to" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "assigned_to" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "assigned_to" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "assigned_to_id" serial DEFAULT -1 NOT NULL;