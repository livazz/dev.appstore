import 'server-only';
import type { Currency } from '@devappstore/core';
import { and, db, eq, games, inArray, isNotNull, items, type DB, type GameSpotlight, type SpotlightAngle, type SpotlightKind } from '@devappstore/db';
import { displayedOldPrice, pctOff } from '@/lib/promo';
import type { GamePlatform } from './catalog';
import { getGameRanking } from './rankings';

/*
 * « À la une » de l'accueil : histoires des jeux live (`games.spotlight`) — actualité (saison, tournoi, nouveautés,
 * success story) ou coup de cœur — avec image de couverture, article conseillé et argument. Champs publics uniquement.
 */

export const SPOTLIGHT_ANGLES: Record<SpotlightAngle, string> = {
  start: 'Idéal pour démarrer',
  complete: 'Pour compléter',
  top: 'Pour rester au sommet',
};

export const SPOTLIGHT_KINDS: Record<SpotlightKind, string> = {
  season: 'Nouvelle saison',
  tournament: 'Tournoi',
  update: 'Nouveautés',
  success: 'Success story',
  pick: 'Coup de cœur',
};

export interface SpotlightEntry {
  game: {
    id: string;
    slug: string;
    name: string;
    category: string;
    platform: GamePlatform;
    iconUrl: string | null;
    bannerUrl: string | null;
    currency: Currency;
  };
  /** Rang dans le top de sa plateforme (ventes des 30 derniers jours) ; null si aucune vente. */
  rank: number | null;
  kind: SpotlightKind;
  title: string;
  text: string;
  date: string | null;
  /** 1 à 3 images (URL brutes : à filtrer par safeImageUrl à l'affichage) ; vide si le jeu n'a aucune capture. */
  covers: string[];
  angle: SpotlightAngle;
  pitch: string;
  item: { id: string; title: string; imageUrl: string | null; priceCents: number; oldPriceCents: number | null; discountPct: number };
}

const KINDS = new Set<string>(Object.keys(SPOTLIGHT_KINDS));
const ANGLES = new Set<string>(Object.keys(SPOTLIGHT_ANGLES));

/** Valide la forme du JSON stocké (colonne jsonb libre) ; null si inexploitable. */
export function parseSpotlight(raw: unknown): GameSpotlight | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const title = str(s.title, 90);
  const text = str(s.text, 220);
  const pitch = str(s.pitch, 140);
  const productId = str(s.productId, 120);
  if (!title || !text || !pitch || !productId || typeof s.kind !== 'string' || !KINDS.has(s.kind) || typeof s.angle !== 'string' || !ANGLES.has(s.angle)) return null;
  const covers = Array.isArray(s.covers) ? s.covers.filter((c): c is string => typeof c === 'string' && c.length > 0).slice(0, 3) : [];
  return {
    kind: s.kind as SpotlightKind, title, text, productId, angle: s.angle as SpotlightAngle, pitch,
    ...(str(s.date, 40) ? { date: str(s.date, 40)! } : {}),
    ...(typeof s.order === 'number' && Number.isFinite(s.order) ? { order: s.order } : {}),
    ...(covers.length ? { covers } : {}),
  };
}

export async function getSpotlights(
  opts: { platform?: GamePlatform | null; limit?: number; now?: Date } = {},
  database: DB = db,
): Promise<SpotlightEntry[]> {
  const now = opts.now ?? new Date();
  const rows = await database
    .select({
      id: games.id, slug: games.slug, name: games.name, category: games.category, platform: games.platform, iconUrl: games.iconUrl,
      bannerUrl: games.bannerUrl, screenshots: games.screenshots, currency: games.currency, spotlight: games.spotlight,
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
        id: items.id, gameId: items.gameId, productId: items.productId, title: items.title, models: items.models, priceCents: items.priceCents,
        oldPriceCents: items.oldPriceCents, promoStartsAt: items.promoStartsAt, promoEndsAt: items.promoEndsAt,
      })
      .from(items)
      .where(and(eq(items.active, true), inArray(items.gameId, parsed.map((g) => g.id)))),
    ...platforms.map((platform) => getGameRanking({ platform, limit: 1000, now }, database)),
  ]);
  const ranked = new Map(rankings.flat().map((r) => [r.entry.id, r.rank]));

  const out: (SpotlightEntry & { order: number })[] = [];
  for (const g of parsed) {
    const it = itemRows.find((i) => i.gameId === g.id && i.productId === g.spotlight.productId);
    if (!it) continue; // article retiré ou désactivé : l'histoire n'est plus affichée
    const oldPriceCents = displayedOldPrice(it, now);
    out.push({
      game: { id: g.id, slug: g.slug, name: g.name, category: g.category, platform: g.platform, iconUrl: g.iconUrl, bannerUrl: g.bannerUrl, currency: g.currency },
      rank: ranked.get(g.id) ?? null,
      kind: g.spotlight.kind,
      title: g.spotlight.title,
      text: g.spotlight.text,
      date: g.spotlight.date ?? null,
      covers: g.spotlight.covers ?? g.screenshots.slice(0, 1),
      angle: g.spotlight.angle,
      pitch: g.spotlight.pitch,
      item: { id: it.id, title: it.title, imageUrl: it.models[0]?.imageUrl ?? null, priceCents: it.priceCents, oldPriceCents, discountPct: pctOff(it.priceCents, oldPriceCents) },
      order: g.spotlight.order ?? 1000,
    });
  }
  // Ordre éditorial d'abord, puis meilleurs rangs de ventes ; jeux sans vente à la fin.
  out.sort((a, b) => a.order - b.order || (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.game.name.localeCompare(b.game.name, 'fr'));
  return out.slice(0, opts.limit ?? 7).map(({ order: _order, ...e }) => e);
}
