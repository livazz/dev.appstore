import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import type { Currency, GameStatus, GameTheme, ItemModel, ItemStyle, ItemType, LayoutId, LinkMethod, Period, StudioRole } from '@devappstore/core';
import { user } from './auth';

/**
 * Histoire mise en avant sur l'accueil pour un jeu : une actualité (saison, tournoi, nouveautés, success story) ou un
 * coup de cœur, toujours portée par une image, puis l'article conseillé et son argument.
 * `angle` : à qui s'adresse l'article (débuter, compléter sa progression, rester au sommet).
 */
export type SpotlightAngle = 'start' | 'complete' | 'top';
export type SpotlightKind = 'season' | 'tournament' | 'update' | 'success' | 'pick';
export type GameSpotlight = {
  kind: SpotlightKind;
  /** Titre court de l'histoire (une ligne). */
  title: string;
  /** Une ou deux phrases au plus. */
  text: string;
  /** Repère temporel affiché en pastille (« Jusqu'au 16 novembre », « Finale samedi »). */
  date?: string;
  productId: string;
  angle: SpotlightAngle;
  /** Argument court pour l'article. */
  pitch: string;
  /** Ordre d'affichage (croissant) ; à défaut, rang de ventes. */
  order?: number;
  /** Images de couverture : une image paysage, ou jusqu'à trois captures portrait juxtaposées. À défaut : première capture du jeu. */
  covers?: string[];
  /** Logo du jeu posé sur la couverture (version allégée de la bannière) ; à défaut : la bannière du jeu. */
  logo?: string;
};

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
    /** Présentation longue affichée sur la page boutique du jeu (paragraphes séparés par une ligne vide). */
    storeDescription: text('store_description').notNull().default(''),
    /** Plateforme du jeu : mobile (iOS/Android) ou PC. */
    platform: text('platform').$type<'mobile' | 'pc'>().notNull().default('mobile'),
    /** Captures d'écran (URL d'images, ordre d'affichage). */
    screenshots: jsonb('screenshots').$type<string[]>().notNull().default([]),
    /** Mise en avant éditoriale sur l'accueil (« Les meilleurs jeux du moment ») ; null = jeu non mis en avant. */
    spotlight: jsonb('spotlight').$type<GameSpotlight>(),
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
     * Ajout « sec/delivery-keys » (D-05) — clé PUBLIQUE du jeu (`das_pub_…`), non secrète, stockée en clair :
     * embarquée dans le client du jeu (SDK sans serveur). Elle ne permet que de demander des codes de liaison et,
     * avec un jeton joueur (`player_tokens`), de lire / acquitter les livraisons de CE joueur.
     * La clé secrète (`apiKeyHash`, `das_secret_…`) reste côté serveur du studio. Nulle tant qu'elle n'a pas été générée.
     * Unicité par index (et non contrainte) : `drizzle-kit push` l'ajoute sans invite sur une table déjà remplie.
     */
    publishableKey: text('publishable_key'),
    /*
     * Ajouts « revue de sécurité 2026-11 » :
     * - webhookSecret est désormais chiffré au repos (`enc:v1:…`, cf. apps/web/src/server/webhook-secrets.ts) ;
     *   webhookSecretPrevious (chiffré) signe encore jusqu'à webhookSecretPreviousExpiresAt (rotation sans coupure, F7) ;
     * - apiKeyPreviousHash : ancienne clé secrète encore acceptée jusqu'à apiKeyPreviousExpiresAt (rotation sans
     *   coupure, F9) ; apiKeyLastUsedAt / apiKeyPreviousLastUsedAt : dernière utilisation (au plus toutes les 5 min).
     */
    webhookSecretPrevious: text('webhook_secret_previous'),
    webhookSecretPreviousExpiresAt: timestamp('webhook_secret_previous_expires_at'),
    apiKeyPreviousHash: text('api_key_previous_hash'),
    apiKeyPreviousPrefix: text('api_key_previous_prefix'),
    apiKeyPreviousExpiresAt: timestamp('api_key_previous_expires_at'),
    apiKeyLastUsedAt: timestamp('api_key_last_used_at'),
    apiKeyPreviousLastUsedAt: timestamp('api_key_previous_last_used_at'),
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
    /** Description de l'article (contenu, avantages), affichée dans le détail avant achat. */
    description: text('description').notNull().default(''),
    keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
    priceCents: integer('price_cents').notNull(),
    oldPriceCents: integer('old_price_cents'),
    quantity: integer('quantity').notNull().default(1),
    models: jsonb('models').$type<ItemModel[]>().notNull().default([]),
    layout: integer('layout').$type<LayoutId>().notNull().default(4),
    style: jsonb('style').$type<ItemStyle>().notNull(),
    position: integer('position').notNull().default(0),
    /** Promotion programmée : le prix barré (old_price_cents) ne s'applique qu'entre ces dates (null = sans limite). */
    promoStartsAt: timestamp('promo_starts_at'),
    promoEndsAt: timestamp('promo_ends_at'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('items_game_product_uq').on(t.gameId, t.productId), index('items_game_idx').on(t.gameId)],
);

/**
 * Ajout « revue de sécurité 2026-11 » (F8, T-DLV-10) — journal d'audit des changements d'intégration d'un jeu
 * (URL de webhook ou de recherche, rotations de clés et de secret). Uniquement des INSERT. `actorUserId` sans clé
 * étrangère : le journal survit à la suppression du compte. `details` ne contient jamais de secret en clair.
 */
export const integrationAuditLog = pgTable(
  'integration_audit_log',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
    studioId: text('studio_id').notNull(),
    actorUserId: text('actor_user_id').notNull(),
    actorRole: text('actor_role').$type<StudioRole>().notNull(),
    action: text('action').notNull(),
    details: jsonb('details').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('integration_audit_game_idx').on(t.gameId, t.createdAt)],
);
