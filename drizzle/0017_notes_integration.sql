CREATE TYPE "public"."integration" AS ENUM('Slack', 'FMS');--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "integration" "integration";--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "author_display_name" varchar;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "integration" "integration";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "author_display_name" varchar;--> statement-breakpoint
UPDATE "notes" SET
    "integration" = CASE
        WHEN "author"->>'source' = 'FMS' THEN 'FMS'::"integration"
        WHEN "author"->>'source' = 'Slack' THEN 'Slack'::"integration"
    END,
    "author_display_name" = CASE
        WHEN "author"->>'source' IN ('FMS', 'Slack') AND "author_id" < 0 THEN "author"->>'username'
    END
WHERE "author" IS NOT NULL;--> statement-breakpoint
UPDATE "messages" SET
    "integration" = CASE
        WHEN "author"->>'source' = 'FMS' THEN 'FMS'::"integration"
        WHEN "author"->>'source' = 'Slack' THEN 'Slack'::"integration"
    END,
    "author_display_name" = CASE
        WHEN "author"->>'source' IN ('FMS', 'Slack') AND "author_id" < 0 THEN "author"->>'username'
    END
WHERE "author" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN "author";--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN "assigned_to";--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN "resolved_by";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "author";
DELETE FROM "team_cycle_logs" WHERE "level" = 'None';