CREATE TYPE "public"."note_request_type" AS ENUM('CSA', 'RI');--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "request_type" "note_request_type";