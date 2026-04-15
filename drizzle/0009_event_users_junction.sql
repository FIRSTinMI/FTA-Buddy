-- Migrate user<->event relationship from two JSONB arrays to a proper junction table.

CREATE TABLE "event_users" (
	"user_id" integer NOT NULL,
	"event_code" varchar NOT NULL,
	CONSTRAINT "event_users_user_id_event_code_pk" PRIMARY KEY("user_id","event_code")
);
--> statement-breakpoint
ALTER TABLE "event_users" ADD CONSTRAINT "event_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_users" ADD CONSTRAINT "event_users_event_code_events_code_fk" FOREIGN KEY ("event_code") REFERENCES "public"."events"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "event_users_event_code_idx" ON "event_users" USING btree ("event_code");
--> statement-breakpoint

-- Backfill from events.users JSONB (source of truth for who is in each event)
INSERT INTO event_users (user_id, event_code)
SELECT u_id::integer, e.code
FROM events e,
     jsonb_array_elements_text(e.users) AS u_id
WHERE jsonb_typeof(e.users) = 'array'
  AND u_id::integer > 0
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = u_id::integer)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Backfill from users.events JSONB (catches users whose event join wasn't reflected in events.users)
INSERT INTO event_users (user_id, event_code)
SELECT u.id, ev_code
FROM users u,
     jsonb_array_elements_text(u.events) AS ev_code
WHERE jsonb_typeof(u.events) = 'array'
  AND EXISTS (SELECT 1 FROM events e WHERE e.code = ev_code)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

ALTER TABLE "events" DROP COLUMN "users";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "events";
