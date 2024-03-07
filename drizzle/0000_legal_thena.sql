DO $$ BEGIN
 CREATE TYPE "role" AS ENUM('ADMIN', 'FTA', 'FTAA', 'CSA');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"code" varchar PRIMARY KEY NOT NULL,
	"pin" varchar NOT NULL,
	"teams" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"token" varchar DEFAULT '' NOT NULL,
	CONSTRAINT "events_pin_unique" UNIQUE("pin")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"message" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"user_id" serial NOT NULL,
	"team" varchar NOT NULL,
	"event_code" varchar NOT NULL,
	"thread" serial NOT NULL,
	"is_ticket" boolean DEFAULT false NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"assigned_to" jsonb DEFAULT '[]' NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar NOT NULL,
	"email" varchar NOT NULL,
	"password" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"events" jsonb DEFAULT '[]' NOT NULL,
	"role" "role" DEFAULT 'FTA' NOT NULL,
	"token" varchar DEFAULT '' NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "events"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
