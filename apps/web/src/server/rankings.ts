import 'server-only';
import type { Currency } from '@devappstore/core';
import { and, count, db, eq, gameReviews, games, gte, inArray, items, lt, orders, sql, type DB } from '@devappstore/db';
import { displayedOldPrice, pctOff } from '@/lib/promo';
import { normalizeCategory, type GamePlatform } from './catalog';
import { rankBySales, rankingWindows, toSalesMap, type RankedEntry, type SalesTotals } from './rankings-logic';

/*
 * Classements publics (/classements, Top 10 de l'accueil) : ventes PAYÉES (`orders.status = 'paid'`, remboursées
 * exclues) des 30 derniers jours, jeux et articles live / actifs uniquement. Index utilisé : orders_status_paid_idx.
 * Ne renvoie que des champs publics.
 */

export interface RankedGame {
  id: string;
  slug: string;
  name: string;
  publisherName: string;
  category: string;
  platform: GamePlatform;
  iconUrl: string | null;
  /** Note moyenne des avis visibles (1 à 5) et nombre d'avis ; null sans avis. */
  rating: { average: number; count: number } | null;
}

export interface RankedItem {
  id: string;
  name: string;
  subtitle: string;
  imageUrl: string | null;
  priceCents: number;
  /** Prix barré affiché maintenant (règle de promo), sinon null. */
  oldPriceCents: number | null;
  discountPct: number;
  game: { id: string; slug: string; name: string; iconUrl: string | null; category: string; platform: GamePlatform; currency: Currency };
}

export type GameRanking = RankedEntry<RankedGame>[];
export type ItemRanking = RankedEntry<RankedItem>[];

type Window = { since: Date; until: Date };

async function salesBy(column: typeof orders.gameId | typeof orders.itemId, w: Window, database: DB): Promise<Map<string, SalesTotals>> {
  const rows = await database
    .select({ key: column, units: sql<number>`coalesce(sum(${orders.quantity}), 0)::int`, revenueCents: sql<number>`coalesce(sum(${orders.amountCents}), 0)::int` })
    .from(orders)
    .where(and(eq(orders.status, 'paid'), gte(orders.paidAt, w.since), lt(orders.paidAt, w.until)))
    .groupBy(column);
  return toSalesMap(rows);
}

/** Note moyenne des avis visibles par jeu (table game_reviews). */
async function ratingsFor(gameIds: string[], database: DB): Promise<Map<string, { average: number; count: number }>> {
  if (!gameIds.length) return new Map();
  const rows = await database
    .select({ gameId: gameReviews.gameId, average: sql<string | null>`avg(${gameReviews.rating})`, count: count() })
    .from(gameReviews)
    .where(and(inArray(gameReviews.gameId, gameIds), eq(gameReviews.status, 'visible')))
    .groupBy(gameReviews.gameId);
  return new Map(rows.filter((r) => Number(r.count) > 0).map((r) => [r.gameId, { average: Math.round(Number(r.average) * 10) / 10, count: Number(r.count) }]));
}

/** Top des jeux live d'une plateforme (filtre de catégorie facultatif). */
export async function getGameRanking(
  opts: { platform: GamePlatform; category?: string | null; limit?: number; now?: Date },
  database: DB = db,
): Promise<GameRanking> {
  const category = normalizeCategory(opts.category);
  const w = rankingWindows(opts.now ?? new Date());
  const list = await database
    .select({
      id: games.id,
      slug: games.slug,
      name: games.name,
      publisherName: games.publisherName,
      category: games.category,
      platform: games.platform,
      iconUrl: games.iconUrl,
    })
    .from(games)
    .where(and(eq(games.status, 'live'), eq(games.platform, opts.platform), category ? eq(games.category, category) : undefined));
  if (!list.length) return [];
  const [current, previous] = await Promise.all([salesBy(orders.gameId, w.current, database), salesBy(orders.gameId, w.previous, database)]);
  const ranked = rankBySales(
    list.map((g) => ({ ...g, rating: null as RankedGame['rating'] })),
    current,
    previous,
    opts.limit ?? 100,
  );
  const ratings = await ratingsFor(ranked.map((r) => r.entry.id), database);
  for (const r of ranked) r.entry.rating = ratings.get(r.entry.id) ?? null;
  return ranked;
}

/** Top des articles actifs les plus vendus, toutes plateformes (ou une seule), filtre de catégorie de jeu facultatif. */
export async function getItemRanking(
  opts: { platform?: GamePlatform | null; category?: string | null; limit?: number; now?: Date } = {},
  database: DB = db,
): Promise<ItemRanking> {
  const category = normalizeCategory(opts.category);
  const now = opts.now ?? new Date();
  const w = rankingWindows(now);
  const [current, previous] = await Promise.all([salesBy(orders.itemId, w.current, database), salesBy(orders.itemId, w.previous, database)]);
  const sold = [...current.keys()];
  if (!sold.length) return [];
  const rows = await database
    .select({
      id: items.id,
      title: items.title,
      subtitle: items.subtitle,
      models: items.models,
      priceCents: items.priceCents,
      oldPriceCents: items.oldPriceCents,
      promoStartsAt: items.promoStartsAt,
      promoEndsAt: items.promoEndsAt,
      game: { id: games.id, slug: games.slug, name: games.name, iconUrl: games.iconUrl, category: games.category, platform: games.platform, currency: games.currency },
    })
    .from(items)
    .innerJoin(games, eq(items.gameId, games.id))
    .where(
      and(
        inArray(items.id, sold),
        eq(items.active, true),
        eq(games.status, 'live'),
        opts.platform ? eq(games.platform, opts.platform) : undefined,
        category ? eq(games.category, category) : undefined,
      ),
    );
  const entries: RankedItem[] = rows.map((r) => {
    const old = displayedOldPrice(r, now);
    return {
      id: r.id,
      name: r.title,
      subtitle: r.subtitle,
      imageUrl: r.models[0]?.imageUrl ?? null,
      priceCents: r.priceCents,
      oldPriceCents: old,
      discountPct: pctOff(r.priceCents, old),
      game: r.game,
    };
  });
  return rankBySales(entries, current, previous, opts.limit ?? 100);
}
