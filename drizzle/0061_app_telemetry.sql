CREATE TABLE IF NOT EXISTS "app_telemetry" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_type" varchar(50) NOT NULL,
  "event_code" varchar,
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "app_telemetry_type_time_idx"
  ON "app_telemetry" ("event_type", "created_at");
