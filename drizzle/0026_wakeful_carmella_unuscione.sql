CREATE TABLE "slack_session_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" varchar NOT NULL,
	"team_name" varchar NOT NULL,
	"team_domain" varchar NOT NULL,
	"token" varchar NOT NULL,
	"cookie_d" varchar NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_polled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
