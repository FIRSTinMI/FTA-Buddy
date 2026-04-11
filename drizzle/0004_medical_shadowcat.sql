CREATE INDEX "analyzed_logs_event_idx" ON "analyzed_logs" USING btree ("event");--> statement-breakpoint
CREATE INDEX "cycle_logs_event_idx" ON "cycle_logs" USING btree ("event");--> statement-breakpoint
CREATE INDEX "match_events_event_code_idx" ON "match_events" USING btree ("event_code");--> statement-breakpoint
CREATE INDEX "match_events_event_code_status_idx" ON "match_events" USING btree ("event_code","status");--> statement-breakpoint
CREATE INDEX "match_logs_event_idx" ON "match_logs" USING btree ("event");--> statement-breakpoint
CREATE INDEX "match_logs_event_analyzed_idx" ON "match_logs" USING btree ("event","analyzed");--> statement-breakpoint
CREATE INDEX "match_logs_event_match_idx" ON "match_logs" USING btree ("event","match_number","play_number");--> statement-breakpoint
CREATE INDEX "notes_event_code_idx" ON "notes" USING btree ("event_code");--> statement-breakpoint
CREATE INDEX "notes_event_code_team_idx" ON "notes" USING btree ("event_code","team");--> statement-breakpoint
CREATE INDEX "notes_event_code_created_at_idx" ON "notes" USING btree ("event_code","created_at");--> statement-breakpoint
CREATE INDEX "robot_cycle_logs_event_idx" ON "team_cycle_logs" USING btree ("event");--> statement-breakpoint
CREATE INDEX "users_token_idx" ON "users" USING btree ("token");