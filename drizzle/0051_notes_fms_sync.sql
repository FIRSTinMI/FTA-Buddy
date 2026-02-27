-- Create note_type enum
DO $$ BEGIN
    CREATE TYPE "public"."note_type" AS ENUM('TeamIssue', 'EventNote', 'MatchNote');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Make team nullable (drop notNull and default)
ALTER TABLE "notes" ALTER COLUMN "team" DROP NOT NULL;
ALTER TABLE "notes" ALTER COLUMN "team" DROP DEFAULT;

-- Add new columns
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "note_type" "note_type";
UPDATE "notes" SET "note_type" = 'TeamIssue' WHERE "note_type" IS NULL;
ALTER TABLE "notes" ALTER COLUMN "note_type" SET NOT NULL;
ALTER TABLE "notes" ALTER COLUMN "note_type" SET DEFAULT 'TeamIssue';
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "match_number" integer;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "play_number" integer;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "tournament_level" "level";
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "fms_note_id" varchar;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "fms_record_version" bigint;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "fms_metadata" jsonb;

-- Unique index on fms_note_id, only where non-null
CREATE UNIQUE INDEX IF NOT EXISTS "notes_fms_note_id_unique"
    ON "notes" ("fms_note_id")
    WHERE "fms_note_id" IS NOT NULL;
