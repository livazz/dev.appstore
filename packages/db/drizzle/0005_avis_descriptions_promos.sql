CREATE TABLE "game_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"user_id" text,
	"author_name" text NOT NULL,
	"rating" integer NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'visible' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "store_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "platform" text DEFAULT 'mobile' NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "screenshots" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "promo_starts_at" timestamp;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "promo_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "game_reviews" ADD CONSTRAINT "game_reviews_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_reviews" ADD CONSTRAINT "game_reviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_reviews_game_user_uq" ON "game_reviews" USING btree ("game_id","user_id");--> statement-breakpoint
CREATE INDEX "game_reviews_game_idx" ON "game_reviews" USING btree ("game_id","created_at");