import { boolean, check, index, integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { Currency } from '@wolleen/core';
import { user } from './auth';
import { games, items } from './studio';
import { orders } from './commerce';

/*
 * Programme de fidélité « Points Wolleen » (phase 3) — voir docs/product/loyalty.md.
 * Les points ne sont PAS une monnaie : jamais achetés, jamais convertibles en argent, non transférables, expirables.
 */

export type LoyaltyReason = 'order_award' | 'order_revoke' | 'redemption' | 'expiry' | 'adjustment';
export type LoyaltyRewardKind = 'discount' | 'bonus_item';
export type LoyaltyRedemptionStatus = 'issued' | 'used' | 'delivered' | 'expired' | 'cancelled';

/**
 * Registre IMMUABLE des mouvements de points (uniquement des INSERT).
 * - lots positifs (order_award, adjustment > 0) : portent expires_at ;
 * - débits (order_revoke, redemption, adjustment < 0) : consomment les lots qui expirent le plus tôt ;
 * - expiry : matérialise l'expiration du lot ref_entry_id (pour l'historique ; le solde l'exclut de toute façon).
 */
export const loyaltyEntries = pgTable(
  'loyalty_entries',
  {
    id: text('id').primaryKey(),
    /** Ordre total d'insertion (rejouer le registre de façon déterministe). */
    seq: integer('seq').generatedAlwaysAsIdentity(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),
    reason: text('reason').$type<LoyaltyReason>().notNull(),
    orderId: text('order_id').references(() => orders.id),
    redemptionId: text('redemption_id'),
    refEntryId: text('ref_entry_id'),
    expiresAt: timestamp('expires_at'),
    note: text('note'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    // Une attribution et une reprise au plus par commande (idempotence de awardPointsForOrder / revokePointsForOrder).
    unique('loyalty_entries_order_reason_uq').on(t.orderId, t.reason),
    // Une expiration au plus par lot.
    unique('loyalty_entries_ref_reason_uq').on(t.refEntryId, t.reason),
    index('loyalty_entries_user_idx').on(t.userId, t.seq),
    check(
      'loyalty_entries_sign_ck',
      sql`(${t.reason} = 'order_award' and ${t.delta} > 0 and ${t.expiresAt} is not null)
        or (${t.reason} in ('order_revoke', 'redemption', 'expiry') and ${t.delta} <= 0)
        or (${t.reason} = 'adjustment' and ${t.delta} <> 0 and (${t.delta} < 0 or ${t.expiresAt} is not null))`,
    ),
  ],
);

/** Catalogue des avantages. `discount` : financé par Wolleen sur sa commission ; `bonus_item` : offert par le studio. */
export const loyaltyRewards = pgTable(
  'loyalty_rewards',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<LoyaltyRewardKind>().notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    pointsCost: integer('points_cost').notNull(),
    /** discount : valeur de la réduction (centimes, devise `currency`). */
    valueCents: integer('value_cents'),
    currency: text('currency').$type<Currency>().notNull().default('EUR'),
    /** bonus_item : jeu et article offerts (livrés comme une commande à 0 €). */
    gameId: text('game_id').references(() => games.id, { onDelete: 'cascade' }),
    itemId: text('item_id').references(() => items.id, { onDelete: 'cascade' }),
    /** Stock total (null = illimité) et nombre déjà racheté. */
    stock: integer('stock'),
    redeemedCount: integer('redeemed_count').notNull().default(0),
    /** Nombre maximum de rachats par joueur (null = illimité). */
    perUserLimit: integer('per_user_limit'),
    /** discount : durée de validité du bon émis. */
    voucherTtlDays: integer('voucher_ttl_days').notNull().default(90),
    active: boolean('active').notNull().default(true),
    startsAt: timestamp('starts_at'),
    endsAt: timestamp('ends_at'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('loyalty_rewards_cost_ck', sql`${t.pointsCost} > 0`),
    check(
      'loyalty_rewards_kind_ck',
      sql`(${t.kind} = 'discount' and ${t.valueCents} > 0) or (${t.kind} = 'bonus_item' and ${t.gameId} is not null and ${t.itemId} is not null)`,
    ),
    check('loyalty_rewards_stock_ck', sql`${t.stock} is null or ${t.redeemedCount} <= ${t.stock}`),
  ],
);

/** Rachats : bon de réduction (issued → used) ou objet bonus (delivered, commande à 0 €). */
export const loyaltyRedemptions = pgTable(
  'loyalty_redemptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    rewardId: text('reward_id').notNull().references(() => loyaltyRewards.id),
    kind: text('kind').$type<LoyaltyRewardKind>().notNull(),
    pointsCost: integer('points_cost').notNull(),
    /** Copie figée de l'avantage. */
    title: text('title').notNull(),
    valueCents: integer('value_cents'),
    currency: text('currency').$type<Currency>().notNull().default('EUR'),
    status: text('status').$type<LoyaltyRedemptionStatus>().notNull(),
    /** discount : commande sur laquelle le bon est utilisé ; bonus_item : commande à 0 € livrée au jeu. */
    orderId: text('order_id').unique().references(() => orders.id),
    expiresAt: timestamp('expires_at'),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('loyalty_redemptions_user_idx').on(t.userId, t.createdAt)],
);
