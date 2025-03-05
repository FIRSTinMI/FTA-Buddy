CREATE TABLE IF NOT EXISTS "slack_servers" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" varchar NOT NULL,
	"team_name" varchar NOT NULL,
	"access_token" varchar NOT NULL,
	"webhook_url" varchar
