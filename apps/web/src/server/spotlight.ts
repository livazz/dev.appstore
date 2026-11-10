import 'server-only';
import type { Currency } from '@devappstore/core';
import { and, db, eq, games, inArray, isNotNull, items, type DB, type GameSpotlight, type SpotlightAngle } from '@devappstore/db';
import { displayedOldPrice, pctOff } from '@/lib/promo';
import type { GamePlatform } from './catalog';
import { getGameRanking } from './rankings';

/*
 * « Les meilleurs jeux du moment » (accueil) : jeux live dotés d'une présentation éditoriale (`games.spotlight`),
 * triés par rang de ventes, avec l'article conseillé et son argument. Ne renvoie que des champs publics.
 */

export const SPOTLIGHT_ANGLES: Record<SpotlightAngle, string> = {
  start: 'Idéal pour bien démarrer',
  complete: 'Pour compléter votre progression',
  top: 'Pour rester au sommet',
};

export interface SpotlightEntry {
  game: {
    id: string;
    slug: string;
    name: string;
    publisherName: string;
    category: string;
    platform: GamePlatform;
    iconUrl: string | null;
    bannerUrl: string | null;
    /** Première capture d'écran (URL brute : à filtrer par safeImageUrl à l'affichage). */
    cover: string | null;
    currency: Currency;
  };
  /** Rang dans le top de sa plateforme (ventes des 30 derniers jours) ; null si aucune vente. */
  rank: number | null;
  rating: { average: number; count: number } | null;
  headline: string;
  reasons: string[];
  angle: SpotlightAngle;
  pitch: string;
  item: { id: string; title: string; imageUrl: string | null; priceCents: number; oldPriceCents: number | null; discountPct: number };
}

/** Valide la forme du JSON stocké (colonne jsonb libre) ; null si inexploitable. */
export function parseSpotlight(raw: unknown): GameSpotlight | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const headline = str(s.headline, 160);
  const pitch = str(s.pitch, 320);
  const productId = str(s.productId, 120);
  const reasons = Array.isArray(s.reasons) ? s.reasons.map((r) => str(r, 200)).filter((r): r is string => r !== null).slice(0, 4) : [];
  const angle = s.angle === 'start' || s.angle === 'complete' || s.angle === 'top' ? s.angle : null;
  if (!headline || !pitch || !productId || !angle || reasons.length === 0) return null;
  return { headline, reasons, productId, angle, pitch };
}

export async function getSpotlights(
  opts: { platform?: GamePlatform | null; limit?: number; now?: Date } = {},
  database: DB = db,
): Promise<SpotlightEntry[]> {
  const now = opts.now ?? new Date();
  const rows = await database
    .select({
      id: games.id,
      slug: games.slug,
      name: games.name,
      publisherName: games.publisherName,
      category: games.category,
      platform: games.platform,
      iconUrl: games.iconUrl,
      bannerUrl: games.bannerUrl,
      screenshots: games.screenshots,
      currency: games.currency,
      spotlight: games.spotlight,
    })
    .from(games)
    .where(and(eq(games.status, 'live'), isNotNull(games.spotlight), opts.platform ? eq(games.platform, opts.platform) : undefined));
  const parsed = rows.flatMap((g) => {
    const spotlight = parseSpotlight(g.spotlight);
    return spotlight ? [{ ...g, spotlight }] : [];
  });
  if (!parsed.length) return [];

  const platforms = [...new Set(parsed.map((g) => g.platform))];
  const [itemRows, ...rankings] = await Promise.all([
    database
      .select({
        id: items.id,
        gameId: items.gameId,
        productId: items.productId,
        title: items.title,
        models: items.models,
        priceCents: items.priceCents,
        oldPriceCents: items.oldPriceCents,
        promoStartsAt: items.promoStartsAt,
        promoEndsAt: items.promoEndsAt,
      })
      .from(items)
      .where(and(eq(items.active, true), inArray(items.gameId, parsed.map((g) => g.id)))),
    ...platforms.map((platform) => getGameRanking({ platform, limit: 1000, now }, database)),
  ]);
  const ranked = new Map(rankings.flat().map((r) => [r.entry.id, r]));

  const out: SpotlightEntry[] = [];
  for (const g of parsed) {
    const it = itemRows.find((i) => i.gameId === g.id && i.productId === g.spotlight.productId);
    if (!it) continue; // article retiré ou désactivé : le jeu n'est plus mis en avant
    const r = ranked.get(g.id);
    const oldPriceCents = displayedOldPrice(it, now);
    out.push({
      game: {
        id: g.id, slug: g.slug, name: g.name, publisherName: g.publisherName, category: g.category, platform: g.platform,
        iconUrl: g.iconUrl, bannerUrl: g.bannerUrl, cover: g.screenshots[0] ?? null, currency: g.currency,
      },
      rank: r?.rank ?? null,
      rating: r?.entry.rating ?? null,
      headline: g.spotlight.headline,
      reasons: g.spotlight.reasons,
      angle: g.spotlight.angle,
      pitch: g.spotlight.pitch,
      item: { id: it.id, title: it.title, imageUrl: it.models[0]?.imageUrl ?? null, priceCents: it.priceCents, oldPriceCents, discountPct: pctOff(it.priceCents, oldPriceCents) },
    });
  }
  // Meilleurs rangs d'abord (plateformes mêlées), jeux sans vente à la fin.
  out.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.game.name.localeCompare(b.game.name, 'fr'));
  return out.slice(0, opts.limit ?? 8);
}
