-- Phase 1: Merge tickets into notes
-- Add ticket-like columns to notes table
ALTER TABLE "notes" ADD COLUMN "assigned_to_id" integer REFERENCES "users"("id");
ALTER TABLE "notes" ADD COLUMN "assigned_to" jsonb;
ALTER TABLE "notes" ADD COLUMN "followers" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "notes" ADD COLUMN "slack_ts" varchar;
ALTER TABLE "notes" ADD COLUMN "slack_channel" varchar;
ALTER TABLE "notes" ADD COLUMN "match_id" uuid REFERENCES "match_logs"("id");

-- Re-parent messages: rename ticket_id -> note_id, change type to uuid, update FK
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_ticket_id_tickets_id_fk";
ALTER TABLE "messages" RENAME COLUMN "ticket_id" TO "note_id";
ALTER TABLE "messages" ALTER COLUMN "note_id" DROP NOT NULL;
ALTER TABLE "messages" ALTER COLUMN "note_id" DROP DEFAULT;
ALTER TABLE "messages" ALTER COLUMN "note_id" TYPE uuid USING NULL;
ALTER TABLE "messages" ALTER COLUMN "note_id" SET NOT NULL;
ALTER TABLE "messages" ADD CONSTRAINT "messages_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "notes"("id");

-- Note: tickets table is left in place (not dropped) to avoid data loss.
-- It is no longer queried by the application.
