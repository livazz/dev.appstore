CREATE TABLE "content_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"item_id" text,
	"target" text NOT NULL,
	"category" text NOT NULL,
	"explanation" text NOT NULL,
	"reporter_email" text NOT NULL,
	"reporter_user_id" text,
	"good_faith_at" timestamp NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decided_at" timestamp,
	"decided_by" text,
	"decision_reason" text,
	"decision_ground" text,
	"decision_notice_id" text,
	"ack_sent_at" timestamp,
	"decision_sent_at" timestamp,
	"notify_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_user_id_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_reports_open_dedupe_idx" ON "content_reports" USING btree ("game_id","target","reporter_email") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "content_reports_status_game_idx" ON "content_reports" USING btree ("status","game_id","created_at");--> statement-breakpoint
CREATE INDEX "content_reports_game_idx" ON "content_reports" USING btree ("game_id","created_at");