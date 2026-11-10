import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { games } from './studio';

/*
 * Avis des joueurs sur un jeu (note 1 à 5 + commentaire). Un avis par compte et par jeu (index unique) ; les avis de
 * démo du seed n'ont pas de compte (`user_id` null, `author_name` affiché). `status` : `visible` ou `hidden` (masqué par
 * la modération).
 */
export type ReviewStatus = 'visible' | 'hidden';

export const gameReviews = pgTable(
  'game_reviews',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    authorName: text('author_name').notNull(),
    rating: integer('rating').notNull(),
    body: text('body').notNull().default(''),
    status: text('status').$type<ReviewStatus>().notNull().default('visible'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('game_reviews_game_user_uq').on(t.gameId, t.userId), index('game_reviews_game_idx').on(t.gameId, t.createdAt)],
);
