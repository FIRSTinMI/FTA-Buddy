DO $$ BEGIN
    CREATE TYPE "public"."ai_report_status" AS ENUM('pending', 'generating', 'ready', 'error');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ai_event_reports" (
    "id" uuid PRIMARY KEY NOT NULL,
    "event_code" varchar UNIQUE NOT NULL,
    "status" "ai_report_status" NOT NULL DEFAULT 'pending',
    "file_path" varchar,
    "error_message" varchar,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "completed_at" timestamp
);

DO $$ BEGIN
    ALTER TABLE "ai_event_reports" ADD CONSTRAINT "ai_event_reports_event_code_events_code_fk"
        FOREIGN KEY ("event_code") REFERENCES "public"."events"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
