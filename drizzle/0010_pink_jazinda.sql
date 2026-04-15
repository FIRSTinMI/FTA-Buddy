-- Migrate notes.followers JSONB array to a proper junction table.

CREATE TABLE "note_followers" (
	"note_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	CONSTRAINT "note_followers_note_id_user_id_pk" PRIMARY KEY("note_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "note_followers" ADD CONSTRAINT "note_followers_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_followers" ADD CONSTRAINT "note_followers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_followers_note_id_idx" ON "note_followers" USING btree ("note_id");--> statement-breakpoint

-- Backfill from notes.followers JSONB (skip pseudo-user id -1 and ids with no matching user row)
INSERT INTO note_followers (note_id, user_id)
SELECT n.id, f.user_id::integer
FROM notes n,
     jsonb_array_elements_text(n.followers) AS f(user_id)
WHERE jsonb_typeof(n.followers) = 'array'
  AND jsonb_array_length(n.followers) > 0
  AND f.user_id::integer > 0
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = f.user_id::integer)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

ALTER TABLE "notes" DROP COLUMN "followers";