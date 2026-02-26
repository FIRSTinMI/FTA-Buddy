-- Create resolution_status enum
DO $$ BEGIN
    CREATE TYPE "public"."resolution_status" AS ENUM('Open', 'Resolved', 'NotApplicable');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create note_issue_type enum
DO $$ BEGIN
    CREATE TYPE "public"."note_issue_type" AS ENUM(
        'RoboRioIssue', 'DSIssue', 'NoRobot', 'RadioIssue', 'RobotPwrIssue',
        'OtherRobotIssue', 'VenueIssue', 'ElectricalIssue', 'MechanicalIssue',
        'VolunteerIssue', 'Other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add new columns
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "resolution_status" "resolution_status" DEFAULT 'NotApplicable';
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "issue_type" "note_issue_type";
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "closed_at" timestamp;

-- Migrate data from fms_metadata JSONB into the new columns
UPDATE "notes"
SET
    resolution_status = (fms_metadata->>'resolutionStatus')::resolution_status,
    issue_type = (fms_metadata->>'issueType')::note_issue_type
WHERE fms_metadata IS NOT NULL;

-- Backfill: TeamIssue notes created from FTA Buddy (no fms_metadata) should be Open
UPDATE "notes"
SET resolution_status = 'Open'
WHERE note_type = 'TeamIssue'
  AND fms_metadata IS NULL
  AND (resolution_status = 'NotApplicable' OR resolution_status IS NULL);
