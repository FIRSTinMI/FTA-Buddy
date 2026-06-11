DO $$ BEGIN
    CREATE TYPE "public"."integration" AS ENUM('Slack', 'FMS');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "integration" "integration";--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "author_display_name" varchar;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "integration" "integration";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "author_display_name" varchar;--> statement-breakpoint
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notes' AND column_name = 'author') THEN
        UPDATE "notes" SET
            "integration" = CASE
                WHEN "author"->>'source' = 'FMS' THEN 'FMS'::"integration"
                WHEN "author"->>'source' = 'Slack' THEN 'Slack'::"integration"
            END,
            "author_display_name" = CASE
                WHEN "author"->>'source' IN ('FMS', 'Slack') AND "author_id" < 0 THEN "author"->>'username'
            END
        WHERE "author" IS NOT NULL;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'author') THEN
        UPDATE "messages" SET
            "integration" = CASE
                WHEN "author"->>'source' = 'FMS' THEN 'FMS'::"integration"
                WHEN "author"->>'source' = 'Slack' THEN 'Slack'::"integration"
            END,
            "author_display_name" = CASE
                WHEN "author"->>'source' IN ('FMS', 'Slack') AND "author_id" < 0 THEN "author"->>'username'
            END
        WHERE "author" IS NOT NULL;
    END IF;
END $$;--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN IF EXISTS "author";--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN IF EXISTS "assigned_to";--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN IF EXISTS "resolved_by";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "author";--> statement-breakpoint
DELETE FROM "team_cycle_logs" WHERE "level" = 'None';
