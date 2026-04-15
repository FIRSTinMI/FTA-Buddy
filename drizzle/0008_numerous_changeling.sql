CREATE TABLE "slack_link_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar NOT NULL,
	"slack_user_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"channel_id" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "slack_link_tokens_token_unique" UNIQUE("token")
);
