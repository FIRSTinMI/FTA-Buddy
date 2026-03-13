ALTER TABLE "notes" ADD COLUMN "resolved_by_id" integer;
ALTER TABLE "notes" ADD COLUMN "resolved_by" jsonb;
ALTER TABLE "notes" ADD CONSTRAINT "notes_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
