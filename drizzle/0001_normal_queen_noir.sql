ALTER TABLE "events" DROP CONSTRAINT "events_pin_unique";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_token_unique" UNIQUE("token");