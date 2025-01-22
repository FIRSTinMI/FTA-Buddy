CREATE TABLE IF NOT EXISTS "notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"text" varchar DEFAULT '' NOT NULL,
	"author_id" integer NOT NULL,
	"author" jsonb NOT NULL,
	"team" integer DEFAULT -1 NOT NULL,
	"event_code" varchar DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"team" integer DEFAULT -1 NOT NULL,
	"subject" varchar DEFAULT '' NOT NULL,
	"author_id" integer NOT NULL,
	"author" jsonb NOT NULL,
	"assigned_to" jsonb,
	"event_code" varchar DEFAULT '' NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"text" varchar DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"messages" jsonb DEFAULT '[]' NOT NULL,
	"match_id" uuid,
	"followers" jsonb DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "message" TO "text";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "user_id" TO "author_id";--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_event_code_events_code_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_match_id_match_logs_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "event_code" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "text" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "author_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "ticket_id" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "author" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "summary";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "team";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "thread";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "is_ticket";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "is_open";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "assigned_to";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "closed_at";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "match_id";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_match_id_match_logs_id_fk" FOREIGN KEY ("match_id") REFERENCES "match_logs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
