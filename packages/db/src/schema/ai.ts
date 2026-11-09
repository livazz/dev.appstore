import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { games, studios } from './studio';

/** Statut d'une génération de style par IA (`pending` = réservation pendant l'appel au modèle). */
export type AiGenerationStatus = 'pending' | 'ok' | 'error';

/**
 * Journal des générations « style de carte depuis une capture du jeu » (@wolleen/ai-style).
 * Sert à la limite de débit par studio (générations `pending` + `ok` sur 24 h glissantes)
 * et au suivi du coût réel (jetons, coût estimé en millionièmes de dollar).
 */
export const aiStyleGenerations = pgTable(
  'ai_style_generations',
  {
    id: text('id').primaryKey(),
    studioId: text('studio_id').notNull().references(() => studios.id, { onDelete: 'cascade' }),
    gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    status: text('status').$type<AiGenerationStatus>().notNull().default('pending'),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    costMicroUsd: integer('cost_micro_usd'),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('ai_style_generations_studio_idx').on(t.studioId, t.createdAt)],
);
