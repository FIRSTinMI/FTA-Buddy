ALTER TABLE "push_subscriptions" ADD COLUMN "keys" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" DROP COLUMN IF EXISTS "auth";--> statement-breakpoint
ALTER TABLE "push_subscriptions" DROP COLUMN IF EXISTS "p256dh";