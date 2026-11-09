import { bigint, index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

/*
 * Ajout vague 6 « realtime » — compteurs du limiteur de débit partagé entre instances
 * (`RATE_LIMIT_STORE=postgres`, `PostgresRateLimitStore` dans apps/web/src/server/rate-limit.ts).
 *
 * Une ligne par (clé, fenêtre fixe) ; la fenêtre glissante est estimée à partir de la fenêtre courante et de la
 * précédente. Incrément conditionnel atomique par `INSERT … ON CONFLICT DO UPDATE … WHERE`. Horodatages en
 * millisecondes epoch (horloge des instances, comme le magasin en mémoire). Les lignes expirées (`expires_at`,
 * fin de la fenêtre suivante) sont purgées au plus une fois par minute et par instance.
 */
export const rateLimitCounters = pgTable(
  'rate_limit_counters',
  {
    key: text('key').notNull(),
    /** Début de la fenêtre fixe (ms epoch, multiple de la durée de fenêtre). */
    windowStart: bigint('window_start', { mode: 'number' }).notNull(),
    count: integer('count').notNull().default(0),
    /** Au-delà, la ligne ne sert plus à aucune estimation (ms epoch). */
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] }), index('rate_limit_counters_expires_idx').on(t.expiresAt)],
);
