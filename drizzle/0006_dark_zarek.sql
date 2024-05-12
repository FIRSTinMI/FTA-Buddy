ALTER TABLE "cycleLogs" RENAME TO "cycle_logs";--> statement-breakpoint
ALTER TABLE "logPublishing" RENAME TO "log_publishing";--> statement-breakpoint
ALTER TABLE "log_publishing" RENAME COLUMN "published_by" TO "expire_time";