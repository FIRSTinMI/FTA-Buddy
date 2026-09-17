CREATE TYPE "public"."ghost_csa_status" AS ENUM('none', 'queued', 'pending', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."upload_kind" AS ENUM('wpilog', 'dslog', 'dsevents', 'support-bundle', 'code-zip', 'zip', 'text', 'other');--> statement-breakpoint
CREATE TYPE "public"."upload_source" AS ENUM('portal', 'app');--> statement-breakpoint
CREATE TABLE "team_upload_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_id" uuid NOT NULL,
	"parent_id" uuid,
	"path" varchar NOT NULL,
	"kind" "upload_kind" NOT NULL,
	"size" integer NOT NULL,
	"content" "bytea",
	"gcs_path" varchar,
	"meta" jsonb,
	"text_preview" text
);
--> statement-breakpoint
CREATE TABLE "team_upload_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"level" "level" NOT NULL,
	"match_number" integer NOT NULL,
	"play_number" integer NOT NULL,
	"station" varchar,
	"team" integer,
	"how" varchar NOT NULL,
	"reason" varchar NOT NULL,
	CONSTRAINT "team_upload_matches_uq" UNIQUE("file_id","match_id")
);
--> statement-breakpoint
CREATE TABLE "team_upload_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_id" uuid NOT NULL,
	"file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"include_analysis" boolean DEFAULT false NOT NULL,
	"include_fms_logs" boolean DEFAULT false NOT NULL,
	"label" varchar,
	"event" varchar,
	"created_by" integer,
	"create_time" timestamp DEFAULT now() NOT NULL,
	"expire_time" timestamp NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar NOT NULL,
	"event" varchar,
	"event_id" uuid,
	"team" integer,
	"team_source" varchar DEFAULT 'none' NOT NULL,
	"source" "upload_source" NOT NULL,
	"uploaded_by" integer,
	"uploader_name" varchar,
	"notes" text,
	"notes_withheld" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"ip_hash" varchar,
	"ghost_status" "ghost_csa_status" DEFAULT 'none' NOT NULL,
	"ghost_ticket" varchar,
	"ghost_analysis" text,
	"ghost_error" varchar,
	"ghost_updated_at" timestamp,
	"ghost_requested_by" integer,
	CONSTRAINT "team_uploads_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "team_upload_files" ADD CONSTRAINT "team_upload_files_upload_id_team_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."team_uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_upload_matches" ADD CONSTRAINT "team_upload_matches_upload_id_team_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."team_uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_upload_matches" ADD CONSTRAINT "team_upload_matches_file_id_team_upload_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."team_upload_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_upload_shares" ADD CONSTRAINT "team_upload_shares_upload_id_team_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."team_uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_upload_shares" ADD CONSTRAINT "team_upload_shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_uploads" ADD CONSTRAINT "team_uploads_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_uploads" ADD CONSTRAINT "team_uploads_ghost_requested_by_users_id_fk" FOREIGN KEY ("ghost_requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_upload_files_upload_idx" ON "team_upload_files" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "team_upload_files_kind_idx" ON "team_upload_files" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "team_upload_matches_upload_idx" ON "team_upload_matches" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "team_upload_matches_match_idx" ON "team_upload_matches" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "team_upload_shares_upload_idx" ON "team_upload_shares" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "team_upload_shares_expire_idx" ON "team_upload_shares" USING btree ("expire_time");--> statement-breakpoint
CREATE INDEX "team_uploads_event_idx" ON "team_uploads" USING btree ("event","created_at");--> statement-breakpoint
CREATE INDEX "team_uploads_event_team_idx" ON "team_uploads" USING btree ("event","team");--> statement-breakpoint
CREATE INDEX "team_uploads_ghost_status_idx" ON "team_uploads" USING btree ("ghost_status");