ALTER TABLE "messages" ALTER COLUMN "event_code" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "event_code" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "assigned_to" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "assigned_to" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "assigned_to" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "event_code" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "followers" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "followers" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "events"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notes" ADD CONSTRAINT "notes_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "events"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "events"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "author";--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN IF EXISTS "author";--> statement-breakpoint
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "author";--> statement-breakpoint
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "messages";