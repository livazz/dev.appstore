import 'server-only';
import { feeCents, GAME_CATEGORIES, type Currency, type GameTheme, type ItemModel, type ItemStyle, type ItemType, type LayoutId, type Period } from '@devappstore/core';
import { and, asc, db, eq, games, gt, ilike, inArray, isNull, items, lte, or, sql, type DB } from '@devappstore/db';
import { env } from '@/env';
import { isLoyaltyEnabled, loyaltyConfigFromEnv, pointsForFee } from './loyalty-logic';
import { activeDiscountPct, displayedOldPrice, isPromoActive, isPromoUpcoming, pctOff, plannedDiscountPct, UPCOMING_PROMO_DAYS, type PromoFields } from '@/lib/promo';

/*
 * Requêtes du catalogue public (tâche « catalog »).
 * Ne renvoie que des champs publics : jamais de secrets d'intégration (webhookSecret, apiKeyHash…).
 * Chaque fonction accepte une base en dernier argument (tests : createTestDb()).
 */

/** Jeu tel qu'affiché dans le catalogue (carte, rangées, résultats de recherche). */
export interface CatalogGame {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  publisherName: string;
  category: string;
  /** Plateforme : mobile (iOS/Android) ou PC. */
  platform: GamePlatform;
  iconUrl: string | null;
  /** Réduction maximale (en %) des articles actifs par rapport à leur prix barré, 0 si aucune. */
  maxDiscountPct: number;
  itemCount: number;
}

/** Article public d'une boutique. */
export interface PublicItem {
  id: string;
  productId: string;
  type: ItemType;
  period: Period;
  title: string;
  subtitle: string;
  keywords: string[];
  priceCents: number;
  oldPriceCents: number | null;
  quantity: number;
  models: ItemModel[];
  layout: LayoutId;
  style: ItemStyle;
  /** Description affichée dans le détail avant achat (renseignée par getLiveGameBySlug). */
  description?: string;
  /** Points Dev AppStore gagnés à l'achat (estimation affichée en boutique) ; null si la fidélité est désactivée. */
  points?: number | null;
}

/** Boutique publique complète d'un jeu live. */
export interface PublicGame {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  publisherName: string;
  category: string;
  description: string;
  /** Présentation longue (paragraphes séparés par une ligne vide). */
  storeDescription: string;
  /** Captures d'écran (URL brutes : à filtrer par safeImageUrl à l'affichage). */
  screenshots: string[];
  iconUrl: string | null;
  bannerUrl: string | null;
  theme: GameTheme;
  currency: Currency;
  items: PublicItem[];
}

/** Article trouvé par la recherche, avec son jeu. */
export interface ItemSearchResult {
  item: PublicItem;
  game: Pick<CatalogGame, 'id' | 'slug' | 'name' | 'iconUrl'> & { currency: Currency };
}

export interface CategoryRow {
  category: string;
  games: CatalogGame[];
}

export type GamePlatform = 'mobile' | 'pc';

/** Plateforme connue (sinon null) — protège contre les valeurs arbitraires de ?plateforme=. */
export function normalizePlatform(p: string | null | undefined): GamePlatform | null {
  const v = (p ?? '').trim().toLowerCase();
  return v === 'mobile' || v === 'pc' ? v : null;
}

/** Réduction en % (arrondie à l'entier inférieur) d'un prix par rapport à son prix barré. */
export function discountPct(priceCents: number, oldPriceCents: number | null | undefined): number {
  return pctOff(priceCents, oldPriceCents);
}

/**
 * Plus forte réduction parmi des articles EN PROMO maintenant (règle de lib/promo : prix barré supérieur et date dans
 * la fenêtre promoStartsAt / promoEndsAt) ; 0 si aucun.
 */
export function maxDiscountPct(list: PromoFields[], now: Date | number = Date.now()): number {
  return list.reduce((m, i) => Math.max(m, activeDiscountPct(i, now)), 0);
}

/**
 * Plus forte réduction d'un jeu par rapport aux prix en jeu (prix barré de ses articles actifs), en % ; 0 si aucune.
 * Renvoyée aux SDK avec le code de liaison.
 */
export async function getGameWebDiscountPct(gameId: string, database: DB = db): Promise<number> {
  const rows = await database
    .select({ priceCents: items.priceCents, oldPriceCents: items.oldPriceCents, promoStartsAt: items.promoStartsAt, promoEndsAt: items.promoEndsAt })
    .from(items)
    .where(and(eq(items.gameId, gameId), eq(items.active, true)));
  // Seuls les prix barrés affichés maintenant comptent (hors fenêtre de promo, rien n'est annoncé au joueur).
  return maxDiscountPct(rows);
}

/** Échappe les jokers LIKE (% _ \) d'une saisie utilisateur. */
export function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Catégorie connue (sinon null) — protège contre les valeurs arbitraires de ?cat=. */
export function normalizeCategory(cat: string | null | undefined): string | null {
  if (!cat) return null;
  return (GAME_CATEGORIES as readonly string[]).find((c) => c.toLowerCase() === cat.trim().toLowerCase()) ?? null;
}

const gameCols = {
  id: games.id,
  slug: games.slug,
  name: games.name,
  subtitle: games.subtitle,
  publisherName: games.publisherName,
  category: games.category,
  platform: games.platform,
  iconUrl: games.iconUrl,
};

const itemCols = {
  id: items.id,
  productId: items.productId,
  type: items.type,
  period: items.period,
  title: items.title,
  subtitle: items.subtitle,
  keywords: items.keywords,
  priceCents: items.priceCents,
  oldPriceCents: items.oldPriceCents,
  quantity: items.quantity,
  models: items.models,
  layout: items.layout,
  style: items.style,
};

type GameRow = Omit<CatalogGame, 'maxDiscountPct' | 'itemCount'>;

/** Ajoute réduction max et nombre d'articles actifs à des lignes de jeux. */
async function withStats(rows: GameRow[], database: DB): Promise<CatalogGame[]> {
  if (!rows.length) return [];
  const prices = await database
    .select({ gameId: items.gameId, priceCents: items.priceCents, oldPriceCents: items.oldPriceCents, promoStartsAt: items.promoStartsAt, promoEndsAt: items.promoEndsAt })
    .from(items)
    .where(and(inArray(items.gameId, rows.map((r) => r.id)), eq(items.active, true)));
  const byGame = new Map<string, PromoFields[]>();
  const now = Date.now();
  for (const p of prices) {
    const l = byGame.get(p.gameId) ?? [];
    l.push(p);
    byGame.set(p.gameId, l);
  }
  return rows.map((r) => {
    const l = byGame.get(r.id) ?? [];
    return { ...r, maxDiscountPct: maxDiscountPct(l, now), itemCount: l.length };
  });
}

/** Tous les jeux live, triés par nom. */
export async function listLiveGames(database: DB = db): Promise<CatalogGame[]> {
  const rows = await database.select(gameCols).from(games).where(eq(games.status, 'live')).orderBy(asc(games.name));
  return withStats(rows, database);
}

/** Jeux à la une : jeux live ayant des articles, les plus fortes réductions d'abord. */
export function pickFeatured(list: CatalogGame[], limit = 6): CatalogGame[] {
  return [...list]
    .filter((g) => g.itemCount > 0)
    .sort((a, b) => b.maxDiscountPct - a.maxDiscountPct || a.name.localeCompare(b.name, 'fr'))
    .slice(0, limit);
}

/** Regroupe des jeux par catégorie, dans l'ordre de GAME_CATEGORIES (catégories inconnues à la fin, vides omises). */
export function groupByCategory(list: CatalogGame[]): CategoryRow[] {
  const map = new Map<string, CatalogGame[]>();
  for (const g of list) {
    const l = map.get(g.category) ?? [];
    l.push(g);
    map.set(g.category, l);
  }
  const known = GAME_CATEGORIES.filter((c) => map.has(c)).map((c) => ({ category: c as string, games: map.get(c)! }));
  const other = [...map.keys()]
    .filter((c) => !(GAME_CATEGORIES as readonly string[]).includes(c))
    .sort((a, b) => a.localeCompare(b, 'fr'))
    .map((c) => ({ category: c, games: map.get(c)! }));
  return [...known, ...other];
}

/** Données de la page d'accueil (filtre facultatif par plateforme). */
export async function getHomeCatalog(database: DB = db, opts: { platform?: GamePlatform | null } = {}) {
  const live = await listLiveGames(database);
  const all = opts.platform ? live.filter((g) => g.platform === opts.platform) : live;
  return { featured: pickFeatured(all), categories: groupByCategory(all), total: all.length };
}

/**
 * Recherche dans le catalogue : jeux live (nom, sous-titre, éditeur, description) et articles actifs
 * (titre, sous-titre, mots-clés) de ces jeux. Sans texte, seule la catégorie filtre les jeux (pas d'articles).
 */
export async function searchCatalog(
  params: { q?: string | null; cat?: string | null },
  database: DB = db,
): Promise<{ q: string; category: string | null; games: CatalogGame[]; items: ItemSearchResult[] }> {
  const q = (params.q ?? '').trim().slice(0, 100);
  const category = normalizeCategory(params.cat);
  if (!q && !category) return { q, category, games: [], items: [] };

  const base = and(eq(games.status, 'live'), category ? eq(games.category, category) : undefined);
  const pattern = `%${escapeLike(q)}%`;

  const gameRows = await database
    .select(gameCols)
    .from(games)
    .where(
      q
        ? and(base, or(ilike(games.name, pattern), ilike(games.subtitle, pattern), ilike(games.publisherName, pattern), ilike(games.description, pattern)))
        : base,
    )
    .orderBy(asc(games.name))
    .limit(50);

  let itemResults: ItemSearchResult[] = [];
  if (q) {
    const rows = await database
      .select({
        item: itemCols,
        promo: { promoStartsAt: items.promoStartsAt, promoEndsAt: items.promoEndsAt },
        game: { id: games.id, slug: games.slug, name: games.name, iconUrl: games.iconUrl, currency: games.currency },
      })
      .from(items)
      .innerJoin(games, eq(items.gameId, games.id))
      .where(
        and(
          base,
          eq(items.active, true),
          or(ilike(items.title, pattern), ilike(items.subtitle, pattern), sql`${items.keywords}::text ilike ${pattern}`),
        ),
      )
      .orderBy(asc(games.name), asc(items.position))
      .limit(60);
    const now = Date.now();
    itemResults = rows.map(({ item, promo, game }) => ({ item: { ...item, oldPriceCents: displayedOldPrice({ ...item, ...promo }, now) }, game }));
  }

  return { q, category, games: await withStats(gameRows, database), items: itemResults };
}

/** Boutique publique d'un jeu live (articles actifs triés par position), ou null si absent / non live. */
export async function getLiveGameBySlug(slug: string, database: DB = db): Promise<PublicGame | null> {
  const [g] = await database
    .select({
      ...gameCols,
      description: games.description,
      storeDescription: games.storeDescription,
      screenshots: games.screenshots,
      bannerUrl: games.bannerUrl,
      theme: games.theme,
      currency: games.currency,
    })
    .from(games)
    .where(and(eq(games.slug, slug), eq(games.status, 'live')))
    .limit(1);
  if (!g) return null;
  const list = await database
    .select({ ...itemCols, description: items.description, promoStartsAt: items.promoStartsAt, promoEndsAt: items.promoEndsAt })
    .from(items)
    .where(and(eq(items.gameId, g.id), eq(items.active, true)))
    .orderBy(asc(items.position), asc(items.createdAt));
  const loyalty = isLoyaltyEnabled() ? loyaltyConfigFromEnv() : null;
  const bps = env.PLATFORM_FEE_BPS;
  const now = Date.now();
  // Prix barré seulement dans la fenêtre de promo (lib/promo) ; le prix facturé reste priceCents.
  return { ...g, items: list.map(({ promoStartsAt, promoEndsAt, ...i }) => ({ ...i, oldPriceCents: displayedOldPrice({ ...i, promoStartsAt, promoEndsAt }, now), points: loyalty ? pointsForFee(feeCents(i.priceCents, bps), loyalty) || null : null })) };
}

/* ------------------------------------------------------------------------------------------------
 * Promos du jour et à venir (accueil). Règle : lib/promo.ts.
 * ---------------------------------------------------------------------------------------------- */

/** Article en promo (ou bientôt) avec son jeu, pour les bandeaux de l'accueil. */
export interface PromoItem {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  priceCents: number;
  /** Prix barré prévu par la promo (affiché seulement quand la promo est en cours). */
  oldPriceCents: number;
  discountPct: number;
  /** ISO 8601 ou null (sans limite). */
  startsAt: string | null;
  endsAt: string | null;
  game: Pick<CatalogGame, 'id' | 'slug' | 'name' | 'iconUrl' | 'platform' | 'category'> & { currency: Currency };
}

type PromoRow = {
  id: string;
  title: string;
  subtitle: string;
  models: ItemModel[];
  priceCents: number;
  oldPriceCents: number | null;
  promoStartsAt: Date | null;
  promoEndsAt: Date | null;
  game: PromoItem['game'];
};

/**
 * Trie et répartit des articles : `live` = promos limitées dans le temps en cours (fin la plus proche d'abord, puis
 * plus forte remise), `upcoming` = promos qui commencent dans les 14 jours (début le plus proche d'abord).
 * Les prix barrés permanents (sans date de fin) ne sont pas des « promos du jour ». Fonction pure (testée).
 */
export function splitPromos(rows: PromoRow[], now: Date | number = Date.now(), limits = { live: 20, upcoming: 12 }) {
  const toItem = (r: PromoRow): PromoItem => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    imageUrl: r.models[0]?.imageUrl ?? null,
    priceCents: r.priceCents,
    oldPriceCents: r.oldPriceCents ?? r.priceCents,
    discountPct: plannedDiscountPct(r),
    startsAt: r.promoStartsAt ? r.promoStartsAt.toISOString() : null,
    endsAt: r.promoEndsAt ? r.promoEndsAt.toISOString() : null,
    game: r.game,
  });
  const byName = (a: PromoItem, b: PromoItem) => a.game.name.localeCompare(b.game.name, 'fr') || a.title.localeCompare(b.title, 'fr');
  const live = rows
    .filter((r) => r.promoEndsAt != null && isPromoActive(r, now))
    .map(toItem)
    .sort((a, b) => a.endsAt!.localeCompare(b.endsAt!) || b.discountPct - a.discountPct || byName(a, b))
    .slice(0, limits.live);
  const upcoming = rows
    .filter((r) => isPromoUpcoming(r, now))
    .map(toItem)
    .sort((a, b) => a.startsAt!.localeCompare(b.startsAt!) || b.discountPct - a.discountPct || byName(a, b))
    .slice(0, limits.upcoming);
  return { live, upcoming };
}

/** Promos en cours (limitées dans le temps) et à venir des jeux live, filtre facultatif par plateforme. */
export async function getPromoItems(
  opts: { platform?: GamePlatform | null; now?: Date } = {},
  database: DB = db,
): Promise<{ live: PromoItem[]; upcoming: PromoItem[] }> {
  const now = opts.now ?? new Date();
  const horizon = new Date(now.getTime() + UPCOMING_PROMO_DAYS * 86_400_000);
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
      game: { id: games.id, slug: games.slug, name: games.name, iconUrl: games.iconUrl, platform: games.platform, category: games.category, currency: games.currency },
    })
    .from(items)
    .innerJoin(games, eq(items.gameId, games.id))
    .where(
      and(
        eq(games.status, 'live'),
        eq(items.active, true),
        sql`${items.oldPriceCents} > ${items.priceCents}`,
        opts.platform ? eq(games.platform, opts.platform) : undefined,
        // en cours (fin future) ou à venir (début ≤ horizon) : on exclut les fins passées et les débuts trop lointains
        or(gt(items.promoEndsAt, now), and(isNull(items.promoEndsAt), gt(items.promoStartsAt, now))),
        or(isNull(items.promoStartsAt), lte(items.promoStartsAt, horizon)),
      ),
    )
    .limit(500);
  return splitPromos(rows, now);
}
