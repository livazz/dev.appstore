import { index, integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { games } from './studio';
import { user } from './auth';

/*
 * Import du catalogue in-app depuis App Store Connect / Google Play (page /studio/games/[id]/import).
 * Module « imports » : apps/web/src/server/import-logic.ts.
 */

/** Store d'origine (miroir de `ImportSource` de @devappstore/importers). */
export type StoreSource = 'app_store' | 'google_play';

/**
 * Identifiants d'API d'un store pour un jeu, chiffrés au repos (AES-256-GCM, clé dérivée de AUTH_SECRET par HKDF,
 * cf. apps/web/src/server/secrets.ts). Le texte chiffré est lié à `game_id` + `source` (données associées) :
 * une ligne recopiée sur un autre jeu ne se déchiffre pas. Jamais renvoyé au navigateur.
 */
export const storeCredentials = pgTable(
  'store_credentials',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
    source: text('source').$type<StoreSource>().notNull(),
    ciphertext: text('ciphertext').notNull(), // base64
    iv: text('iv').notNull(), // base64, 12 octets
    tag: text('tag').notNull(), // base64, 16 octets
    /** Rappel NON secret affiché au studio (Key ID, Apple ID de l'app, nom de package, e-mail du compte de service). */
    hint: text('hint').notNull().default(''),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('store_credentials_game_source_uq').on(t.gameId, t.source)],
);

export type ImportRunStatus = 'fetched' | 'imported' | 'failed';
export type ImportRunMode = 'live' | 'demo';

/** Avertissement d'import conservé au journal (forme de `ImportWarning` de @devappstore/importers). */
export interface ImportRunWarning {
  source: StoreSource;
  productId?: string;
  code: string;
  message: string;
}

/** Journal des imports : une ligne par récupération du catalogue, complétée lors de l'import de la sélection. */
export const importRuns = pgTable(
  'import_runs',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    mode: text('mode').$type<ImportRunMode>().notNull().default('live'),
    sources: jsonb('sources').$type<StoreSource[]>().notNull().default([]),
    status: text('status').$type<ImportRunStatus>().notNull(),
    productsFound: integer('products_found').notNull().default(0),
    itemsCreated: integer('items_created').notNull().default(0),
    warnings: jsonb('warnings').$type<ImportRunWarning[]>().notNull().default([]),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    importedAt: timestamp('imported_at'),
  },
  (t) => [index('import_runs_game_idx').on(t.gameId, t.createdAt)],
);
