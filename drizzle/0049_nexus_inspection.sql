ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "nexusApiKey" varchar;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "startDate" varchar;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "endDate" varchar;
