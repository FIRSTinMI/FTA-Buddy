ALTER TABLE "log_publishing" ALTER COLUMN "expire_time" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "log_publishing" ADD COLUMN "team" integer NOT NULL;