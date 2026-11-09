ALTER TABLE "items" DROP CONSTRAINT "items_game_product_uq";--> statement-breakpoint
ALTER TABLE "game_links" DROP CONSTRAINT "game_links_user_game_uq";--> statement-breakpoint
ALTER TABLE "link_codes" DROP CONSTRAINT "link_codes_game_code_uq";--> statement-breakpoint
ALTER TABLE "notifications_sent" DROP CONSTRAINT "notifications_sent_kind_ref_uq";--> statement-breakpoint
ALTER TABLE "store_credentials" DROP CONSTRAINT "store_credentials_game_source_uq";--> statement-breakpoint
ALTER TABLE "loyalty_entries" DROP CONSTRAINT "loyalty_entries_order_reason_uq";--> statement-breakpoint
ALTER TABLE "loyalty_entries" DROP CONSTRAINT "loyalty_entries_ref_reason_uq";--> statement-breakpoint
DROP INDEX "orders_user_idx";--> statement-breakpoint
UPDATE "verification" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
UPDATE "verification" SET "updated_at" = now() WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "items_game_product_uq" ON "items" USING btree ("game_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_links_user_game_uq" ON "game_links" USING btree ("user_id","game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "link_codes_game_code_uq" ON "link_codes" USING btree ("game_id","code");--> statement-breakpoint
CREATE INDEX "link_codes_player_idx" ON "link_codes" USING btree ("game_id","player_id");--> statement-breakpoint
CREATE INDEX "orders_user_created_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_paid_idx" ON "orders" USING btree ("status","paid_at");--> statement-breakpoint
CREATE INDEX "orders_payment_intent_idx" ON "orders" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "player_tokens_user_idx" ON "player_tokens" USING btree ("user_id","game_id");--> statement-breakpoint
CREATE INDEX "webhook_attempts_delivery_idx" ON "webhook_attempts" USING btree ("delivery_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_attempts_refund_idx" ON "webhook_attempts" USING btree ("refund_delivery_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_sent_kind_ref_uq" ON "notifications_sent" USING btree ("kind","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_credentials_game_source_uq" ON "store_credentials" USING btree ("game_id","source");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_entries_order_reason_uq" ON "loyalty_entries" USING btree ("order_id","reason");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_entries_ref_reason_uq" ON "loyalty_entries" USING btree ("ref_entry_id","reason");