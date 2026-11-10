CREATE TABLE "integration_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"studio_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "webhook_secret_previous" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "webhook_secret_previous_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "api_key_previous_hash" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "api_key_previous_prefix" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "api_key_previous_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "api_key_last_used_at" timestamp;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "api_key_previous_last_used_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_anomaly" text;--> statement-breakpoint
ALTER TABLE "integration_audit_log" ADD CONSTRAINT "integration_audit_log_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_audit_game_idx" ON "integration_audit_log" USING btree ("game_id","created_at");