ALTER TABLE "analyzed_logs" ADD COLUMN "start_index" integer;
ALTER TABLE "analyzed_logs" ADD COLUMN "end_index" integer;

-- Reset analyzed flag so logs get re-analyzed with indices populated
UPDATE "match_logs" SET "analyzed" = false;
-- Clear existing analysis rows so they get re-created with indices
DELETE FROM "analyzed_logs";
