import { integer, pgTable, text, timestamp, unique, index, jsonb } from 'drizzle-orm/pg-core';
import type { Currency, DeliveryStatus, LinkMethod, OrderStatus, PurchaseEvent } from '@wolleen/core';
import { user } from './auth';
import { games, items } from './studio';

/** Compte joueur Wolleen ↔ compte dans un jeu (un seul par jeu et par utilisateur). */
export const gameLinks = pgTable(
  'game_links',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
    playerId: text('player_id').notNull(),
    playerName: text('player_name'),
    method: text('method').$type<LinkMethod>().notNull(),
    verified: integer('verified').notNull().default(0), // 1 = vérifié (code/oauth), 0 = déclaratif (id_confirm)
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [unique('game_links_user_game_uq').on(t.userId, t.gameId), index('game_links_player_idx').on(t.gameId, t.playerId)],
);

/** Code affiché dans le jeu (demandé par le serveur ou le SDK du jeu) et saisi sur le site. */
export const linkCodes = pgTable(
  'link_codes',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
    playerId: text('player_id').notNull(),
    playerName: text('player_name'),
    code: text('code').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    consumedAt: timestamp('consumed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [unique('link_codes_game_code_uq').on(t.gameId, t.code)],
);

export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id),
    gameId: text('game_id').notNull().references(() => games.id),
    itemId: text('item_id').notNull().references(() => items.id),
    // Copie figée au moment de l'achat
    productId: text('product_id').notNull(),
    itemTitle: text('item_title').notNull(),
    playerId: text('player_id').notNull(),
    quantity: integer('quantity').notNull().default(1),
    amountCents: integer('amount_cents').notNull(),
    platformFeeCents: integer('platform_fee_cents').notNull(),
    currency: text('currency').$type<Currency>().notNull(),
    status: text('status').$type<OrderStatus>().notNull().default('pending'),
    stripeCheckoutSessionId: text('stripe_checkout_session_id').unique(),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    paidAt: timestamp('paid_at'),
    // Ajout tâche « payments » (sécurité / conformité) — preuve de la demande de livraison immédiate et de la
    // renonciation au droit de rétractation (art. L221-28 13° C. conso), recueillie avant le paiement.
    withdrawalWaiverAt: timestamp('withdrawal_waiver_at'),
    termsVersion: text('terms_version'),
    consentIp: text('consent_ip'), // IP tronquée (/24 en IPv4, /48 en IPv6)
    refundedAt: timestamp('refunded_at'),
  },
  (t) => [index('orders_game_idx').on(t.gameId, t.createdAt), index('orders_user_idx').on(t.userId)],
);

/** Livraison d'un achat au jeu : webhook vers le serveur du studio et/ou récupération par le SDK. */
export const deliveries = pgTable(
  'deliveries',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id').notNull().unique().references(() => orders.id),
    gameId: text('game_id').notNull().references(() => games.id),
    playerId: text('player_id').notNull(),
    payload: jsonb('payload').$type<PurchaseEvent>().notNull(),
    status: text('status').$type<DeliveryStatus>().notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    nextAttemptAt: timestamp('next_attempt_at'),
    deliveredAt: timestamp('delivered_at'),
    acknowledgedAt: timestamp('acknowledged_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('deliveries_pending_idx').on(t.status, t.nextAttemptAt), index('deliveries_player_idx').on(t.gameId, t.playerId, t.status)],
);

export const webhookAttempts = pgTable('webhook_attempts', {
  id: text('id').primaryKey(),
  deliveryId: text('delivery_id').notNull().references(() => deliveries.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  statusCode: integer('status_code'),
  error: text('error'),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/*
 * Ajout tâche « linking » — tentatives de liaison d'un compte de jeu, par utilisateur Wolleen :
 * - kind = 'code'   : saisie d'un code (ok = 0 → échec, compté pour l'anti force brute) ;
 * - kind = 'lookup' : appel « player lookup » du studio (limité pour éviter l'énumération des joueurs).
 *   Une recherche réussie (ok = 1) porte le joueur trouvé et sert de jeton de confirmation (usedAt = consommé).
 */
export const linkAttempts = pgTable(
  'link_attempts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'code' | 'lookup'>().notNull(),
    ok: integer('ok').notNull().default(0),
    playerId: text('player_id'),
    playerName: text('player_name'),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('link_attempts_user_idx').on(t.userId, t.kind, t.createdAt)],
);

/*
 * Ajout tâche « payments » (sécurité) — événements Stripe déjà reçus, pour l'idempotence par `event.id`
 * (Stripe peut livrer plusieurs fois le même événement). `processedAt` est rempli une fois le traitement réussi ;
 * `alert` garde la trace d'une anomalie (montant/devise incohérents, remboursement partiel…) à vérifier.
 */
export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(), // evt_…
  type: text('type').notNull(),
  orderId: text('order_id'),
  detail: text('detail'),
  alert: text('alert'),
  receivedAt: timestamp('received_at').notNull().defaultNow(),
  processedAt: timestamp('processed_at'),
});
