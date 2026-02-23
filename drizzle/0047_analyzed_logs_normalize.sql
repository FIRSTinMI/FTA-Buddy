-- Create the issue enum type
DO $$ BEGIN
    CREATE TYPE "issue" AS ENUM('Bypassed', 'Code disconnect', 'RIO disconnect', 'Radio disconnect', 'DS disconnect', 'Brownout', 'Large spike in ping', 'Sustained high ping', 'Low signal', 'High BWU');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Add new columns
ALTER TABLE "analyzed_logs" ADD COLUMN "issue" "issue" NOT NULL DEFAULT 'Bypassed';--> statement-breakpoint
ALTER TABLE "analyzed_logs" ADD COLUMN "start_time" integer;--> statement-breakpoint
ALTER TABLE "analyzed_logs" ADD COLUMN "end_time" integer;--> statement-breakpoint
ALTER TABLE "analyzed_logs" ADD COLUMN "duration" integer;--> statement-breakpoint

-- Drop old columns
ALTER TABLE "analyzed_logs" DROP COLUMN IF EXISTS "events";--> statement-breakpoint
ALTER TABLE "analyzed_logs" DROP COLUMN IF EXISTS "bypassed";--> statement-breakpoint

-- Remove the default on issue (was only needed for migration)
ALTER TABLE "analyzed_logs" ALTER COLUMN "issue" DROP DEFAULT;
