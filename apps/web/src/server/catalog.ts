import 'server-only';
import { feeCents, GAME_CATEGORIES, type Currency, type GameTheme, type ItemModel, type ItemStyle, type ItemType, type LayoutId, type Period } from '@devappstore/core';
import { and, asc, db, eq, games, ilike, inArray, items, or, sql, type DB } from '@devappstore/db';
import { env } from '@/env';
import { isLoyaltyEnabled, loyaltyConfigFromEnv, pointsForFee } from './loyalty-logic';

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

/** Réduction en % (arrondie à l'entier inférieur) d'un prix par rapport à son prix barré. */
export function discountPct(priceCents: number, oldPriceCents: number | null | undefined): number {
  if (oldPriceCents == null || oldPriceCents <= 0 || oldPriceCents <= priceCents) return 0;
  return Math.floor(((oldPriceCents - priceCents) * 100) / oldPriceCents);
}

/** Plus forte réduction parmi des articles (0 si aucun n'a de prix barré supérieur). */
export function maxDiscountPct(list: { priceCents: number; oldPriceCents: number | null }[]): number {
  return list.reduce((m, i) => Math.max(m, discountPct(i.priceCents, i.oldPriceCents)), 0);
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
    .select({ gameId: items.gameId, priceCents: items.priceCents, oldPriceCents: items.oldPriceCents })
    .from(items)
    .where(and(inArray(items.gameId, rows.map((r) => r.id)), eq(items.active, true)));
  const byGame = new Map<string, { priceCents: number; oldPriceCents: number | null }[]>();
  for (const p of prices) {
    const l = byGame.get(p.gameId) ?? [];
    l.push(p);
    byGame.set(p.gameId, l);
  }
  return rows.map((r) => {
    const l = byGame.get(r.id) ?? [];
    return { ...r, maxDiscountPct: maxDiscountPct(l), itemCount: l.length };
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

/** Données de la page d'accueil. */
export async function getHomeCatalog(database: DB = db) {
  const all = await listLiveGames(database);
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
      .select({ item: itemCols, game: { id: games.id, slug: games.slug, name: games.name, iconUrl: games.iconUrl, currency: games.currency } })
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
    itemResults = rows;
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
    .select({ ...itemCols, description: items.description })
    .from(items)
    .where(and(eq(items.gameId, g.id), eq(items.active, true)))
    .orderBy(asc(items.position), asc(items.createdAt));
  const loyalty = isLoyaltyEnabled() ? loyaltyConfigFromEnv() : null;
  const bps = env.PLATFORM_FEE_BPS;
  return { ...g, items: list.map((i) => ({ ...i, points: loyalty ? pointsForFee(feeCents(i.priceCents, bps), loyalty) || null : null })) };
}
