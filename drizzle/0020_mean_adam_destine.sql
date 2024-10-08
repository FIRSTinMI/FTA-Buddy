ALTER TABLE "analyzed_logs" ADD COLUMN "match_id" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analyzed_logs" ADD CONSTRAINT "analyzed_logs_match_id_match_logs_id_fk" FOREIGN KEY ("match_id") REFERENCES "match_logs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
