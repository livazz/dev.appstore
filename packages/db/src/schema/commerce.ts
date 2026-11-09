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
    /*
     * Ajouts « sec/delivery-keys » — la ligne sert aussi de « demande de liaison » (link_request_id = id) :
     * - consumedBy : utilisateur Wolleen qui a saisi le code (le jeton joueur lui est rattaché) ;
     * - source : clé qui a demandé le code (« publishable » = SDK client sans serveur, « secret » = serveur du studio) ;
     * - tokenIssuedAt : jeton joueur déjà délivré pour cette demande (échange unique).
     */
    consumedBy: text('consumed_by'),
    source: text('source').$type<'secret' | 'publishable'>(),
    tokenIssuedAt: timestamp('token_issued_at'),
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
  /** Ajout « sec/delivery-keys » : tentative d'envoi d'un remboursement (deliveryId = livraison d'achat d'origine). */
  refundDeliveryId: text('refund_delivery_id').references(() => refundDeliveries.id, { onDelete: 'cascade' }),
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
 * Ajout « sec/delivery-keys » — événements `purchase.refunded` (enqueueRefund, appelé par « payments »).
 * Mêmes colonnes que `deliveries` (le code de livraison les traite avec les mêmes requêtes) + l'achat d'origine.
 * Table séparée car `deliveries.orderId` est unique (une livraison d'achat par commande) et que les ventes / l'historique
 * joignent `deliveries` sur `orderId`. Un seul remboursement par commande.
 */
export const refundDeliveries = pgTable(
  'refund_deliveries',
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
    purchaseDeliveryId: text('purchase_delivery_id').notNull().references(() => deliveries.id, { onDelete: 'cascade' }),
  },
  (t) => [
    index('refund_deliveries_pending_idx').on(t.status, t.nextAttemptAt),
    index('refund_deliveries_player_idx').on(t.gameId, t.playerId, t.status),
  ],
);

/*
 * Ajout « sec/delivery-keys » (D-05) — jeton joueur opaque (`wk_pt_…`) délivré au SDK client après la liaison par code
 * (GET /api/v1/link-requests/{id}). Seule l'empreinte SHA-256 est stockée. Avec la clé publique du jeu, il donne accès
 * aux livraisons de `playerId` achetées par `userId` (le compte Wolleen qui a saisi le code), et à rien d'autre.
 * Révocable (revokedAt) par le SDK, le serveur du studio ou l'onglet Intégration.
 */
export const playerTokens = pgTable(
  'player_tokens',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
    playerId: text('player_id').notNull(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    /** Demande de liaison (link_codes.id) qui a produit le jeton — sans clé étrangère : les codes sont purgés. */
    linkCodeId: text('link_code_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at'),
    revokedAt: timestamp('revoked_at'),
  },
  (t) => [index('player_tokens_player_idx').on(t.gameId, t.playerId)],
);
