CREATE TABLE "power_samples" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event" varchar NOT NULL,
	"monitor_id" varchar NOT NULL,
	"time" timestamp NOT NULL,
	"volts" real NOT NULL,
	"volts_min" real NOT NULL,
	"volts_max" real NOT NULL,
	"amps" real NOT NULL,
	"amps_max" real NOT NULL,
	"watts" real NOT NULL,
	"watts_max" real NOT NULL,
	"hz" real,
	"hz_min" real,
	"pf" real,
	"pf_min" real,
	"kwh" real,
	"alarm" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "powerMonitoring" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "powerAlertSettings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "power_samples_event_time_idx" ON "power_samples" USING btree ("event","time");--> statement-breakpoint
CREATE INDEX "power_samples_event_monitor_time_idx" ON "power_samples" USING btree ("event","monitor_id","time");