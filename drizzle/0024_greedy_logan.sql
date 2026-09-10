CREATE TYPE "public"."troubleshoot_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."troubleshoot_source" AS ENUM('wpilib', 'rev', 'ctre', 'ni', 'vivid', 'ticket', 'slack', 'note');--> statement-breakpoint
CREATE TABLE "slack_user_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"team_id" varchar NOT NULL,
	"team_name" varchar NOT NULL,
	"slack_user_id" varchar NOT NULL,
	"access_token" varchar NOT NULL,
	"scopes" varchar DEFAULT '' NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_polled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "troubleshoot_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "troubleshoot_source" NOT NULL,
	"source_key" varchar NOT NULL,
	"url" varchar,
	"title" varchar NOT NULL,
	"heading" varchar,
	"body" text NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("heading", '') || ' ' || coalesce("body", ''))) STORED,
	"source_date" timestamp,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "troubleshoot_chunks_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "troubleshoot_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"ip" varchar,
	"model" varchar NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd_micro" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "troubleshoot_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "troubleshoot_role" NOT NULL,
	"text" text NOT NULL,
	"cited_chunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slack_user_tokens" ADD CONSTRAINT "slack_user_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "troubleshoot_conversations" ADD CONSTRAINT "troubleshoot_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "troubleshoot_messages" ADD CONSTRAINT "troubleshoot_messages_conversation_id_troubleshoot_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."troubleshoot_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "troubleshoot_chunks_tsv_idx" ON "troubleshoot_chunks" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "troubleshoot_chunks_source_idx" ON "troubleshoot_chunks" USING btree ("source");--> statement-breakpoint
CREATE INDEX "troubleshoot_conversations_user_idx" ON "troubleshoot_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "troubleshoot_messages_conversation_idx" ON "troubleshoot_messages" USING btree ("conversation_id");