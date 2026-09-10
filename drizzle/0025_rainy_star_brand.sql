ALTER TABLE "troubleshoot_chunks" drop column "tsv";--> statement-breakpoint
ALTER TABLE "troubleshoot_chunks" ADD COLUMN "tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("title", '')), 'A') || setweight(to_tsvector('english', coalesce("heading", '')), 'B') || setweight(to_tsvector('english', coalesce("body", '')), 'C')) STORED;--> statement-breakpoint
CREATE INDEX "troubleshoot_chunks_tsv_idx" ON "troubleshoot_chunks" USING gin ("tsv");
