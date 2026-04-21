CREATE TABLE "checklist" (
	"event_code" text NOT NULL,
	"team_number" text NOT NULL,
	"present" boolean DEFAULT false NOT NULL,
	"inspected" boolean DEFAULT false NOT NULL,
	"radio_programmed" boolean DEFAULT false NOT NULL,
	"connection_tested" boolean DEFAULT false NOT NULL,
	CONSTRAINT "checklist_event_code_team_number_pk" PRIMARY KEY("event_code","team_number")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"number" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist" ADD CONSTRAINT "checklist_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "public"."events"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist" ADD CONSTRAINT "checklist_team_number_teams_number_fk" FOREIGN KEY ("team_number") REFERENCES "public"."teams"("number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Populate teams table from all existing events' team JSON arrays
INSERT INTO teams (number, name)
SELECT DISTINCT ON (num) num, COALESCE(name, '')
FROM (
  SELECT elem->>'number' AS num, elem->>'name' AS name
  FROM events,
    jsonb_array_elements(
      CASE WHEN jsonb_typeof(teams::jsonb) = 'array' THEN teams::jsonb ELSE '[]'::jsonb END
    ) AS elem
  WHERE elem->>'number' IS NOT NULL AND elem->>'number' != ''
) t
ON CONFLICT (number) DO UPDATE SET name = EXCLUDED.name;--> statement-breakpoint
-- Populate per-event checklist table from existing checklist JSON objects
INSERT INTO checklist (event_code, team_number, present, inspected, radio_programmed, connection_tested)
SELECT
  events.code,
  key::text,
  COALESCE((value->>'present')::bool, false),
  COALESCE((value->>'inspected')::bool, false),
  COALESCE((value->>'radioProgrammed')::bool, false),
  COALESCE((value->>'connectionTested')::bool, false)
FROM events,
  jsonb_each(
    CASE WHEN jsonb_typeof(checklist::jsonb) = 'object' THEN checklist::jsonb ELSE '{}'::jsonb END
  ) AS e(key, value)
WHERE key IS NOT NULL AND key != ''
  AND EXISTS (SELECT 1 FROM teams WHERE number = key::text)
ON CONFLICT DO NOTHING;