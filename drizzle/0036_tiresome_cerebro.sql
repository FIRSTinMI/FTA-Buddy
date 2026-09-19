ALTER TABLE "team_uploads" ADD COLUMN "submission_hash" varchar;--> statement-breakpoint
CREATE INDEX "team_uploads_submission_hash_idx" ON "team_uploads" USING btree ("submission_hash");