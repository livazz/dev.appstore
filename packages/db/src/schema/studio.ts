import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, index, uniqueIndex } from 'drizzle-orm/pg-core';
import type { Currency, GameStatus, GameTheme, ItemModel, ItemStyle, ItemType, LayoutId, LinkMethod, Period, StudioRole } from '@wolleen/core';
import { user } from './auth';

/** Studio (compte vendeur). Le paiement est reversé sur son compte Stripe Connect. */
export const studios = pgTable('studios', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  stripeAccountId: text('stripe_account_id'),
  stripeChargesEnabled: boolean('stripe_charges_enabled').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const studioMembers = pgTable(
  'studio_members',
  {
    studioId: text('studio_id').notNull().references(() => studios.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').$type<StudioRole>().notNull().default('owner'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studioId, t.userId] })],
);

/** Un jeu publié dans le catalogue, avec sa boutique et son intégration. */
export const games = pgTable(
  'games',
  {
    id: text('id').primaryKey(),
    studioId: text('studio_id').notNull().references(() => studios.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    subtitle: text('subtitle').notNull().default(''),
    publisherName: text('publisher_name').notNull().default(''),
    category: text('category').notNull().default('Casual'),
    description: text('description').notNull().default(''),
    iconUrl: text('icon_url'),
    bannerUrl: text('banner_url'),
    theme: jsonb('theme').$type<GameTheme>().notNull(),
    currency: text('currency').$type<Currency>().notNull().default('EUR'),
    status: text('status').$type<GameStatus>().notNull().default('draft'),
    // Intégration
    linkMethods: jsonb('link_methods').$type<LinkMethod[]>().notNull().default(['code']),
    playerLookupUrl: text('player_lookup_url'),
    webhookUrl: text('webhook_url'),
    webhookSecret: text('webhook_secret').notNull(),
    apiKeyHash: text('api_key_hash').notNull(),
    apiKeyPrefix: text('api_key_prefix').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    /**
     * Ajout « sec/delivery-keys » (D-05) — clé PUBLIQUE du jeu (`wk_pub_…`), non secrète, stockée en clair :
     * embarquée dans le client du jeu (SDK sans serveur). Elle ne permet que de demander des codes de liaison et,
     * avec un jeton joueur (`player_tokens`), de lire / acquitter les livraisons de CE joueur.
     * La clé secrète (`apiKeyHash`, `wk_secret_…`) reste côté serveur du studio. Nulle tant qu'elle n'a pas été générée.
     * Unicité par index (et non contrainte) : `drizzle-kit push` l'ajoute sans invite sur une table déjà remplie.
     */
    publishableKey: text('publishable_key'),
  },
  (t) => [
    index('games_status_idx').on(t.status),
    index('games_studio_idx').on(t.studioId),
    uniqueIndex('games_publishable_key_uq').on(t.publishableKey),
  ],
);

export const items = pgTable(
  'items',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
    productId: text('product_id').notNull(),
    type: text('type').$type<ItemType>().notNull().default('consumable'),
    period: text('period').$type<Period>().notNull().default('month'),
    title: text('title').notNull(),
    subtitle: text('subtitle').notNull().default(''),
    keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
    priceCents: integer('price_cents').notNull(),
    oldPriceCents: integer('old_price_cents'),
    quantity: integer('quantity').notNull().default(1),
    models: jsonb('models').$type<ItemModel[]>().notNull().default([]),
    layout: integer('layout').$type<LayoutId>().notNull().default(4),
    style: jsonb('style').$type<ItemStyle>().notNull(),
    position: integer('position').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('items_game_product_uq').on(t.gameId, t.productId), index('items_game_idx').on(t.gameId)],
);
