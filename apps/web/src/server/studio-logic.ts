import 'server-only';
import { isLibraryArt } from '@/lib/art-library';
import { z } from 'zod';
import {
  DEFAULT_THEME,
  GAME_CATEGORIES,
  GRID_LIMITS,
  MIN_CHARGE_CENTS,
  PRICE_TIERS_CENTS,
  newId,
  randomToken,
  slugify,
  type Currency,
  type GameTheme,
} from '@devappstore/core';
import { and, asc, count, eq, games, gte, inArray, items, orders, studioMembers, studios, sum, type DB } from '@devappstore/db';
import { generatePublishableKey, generateSecretApiKey } from './api-key';
import { uploaderOfUrl, uploaderSegment } from './image-upload';

/*
 * Logique de l'espace studio (création de jeu, édition de la boutique, articles).
 * Fonctions pures vis-à-vis de la session : elles reçoivent la base et un gameId déjà autorisé.
 * Les Server Actions de `studio.ts` vérifient les droits (requireGameAccess) puis délèguent ici.
 */

export class StudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudioError';
  }
}

export type GameRow = typeof games.$inferSelect;
export type ItemRow = typeof items.$inferSelect;

/* ------------------------------------------------------------------ */
/* Schémas zod                                                         */
/* ------------------------------------------------------------------ */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide (format #RRGGBB).');
const hexOrNone = z.union([hex, z.literal('transparent')]);

const DATA_IMAGE_RE = /^data:image\/(png|jpeg|webp|gif|avif|svg\+xml)[;,]/i;

/**
 * URL d'image acceptée (CHK-UPL-07, T-UPL-05) : uniquement un fichier produit par notre stockage — disque local
 * (/api/uploads/<kind>/<utilisateur>/<id>.webp) ou S3/R2 (<S3_PUBLIC_URL>/<kind>/<utilisateur>/<id>.webp) —, ou, hors
 * production seulement, une data URL d'image (visuels de démo du seed, affichés dans <img> : aucune requête ni script).
 * Les illustrations de la bibliothèque de la plateforme (/art/…, fichiers statiques, cf. lib/art-library) sont acceptées partout.
 * En production les data URL sont refusées (revue 2026-11, C-04) : ni ré-encodées, ni rattachées au studio, et lourdes. Les URL https
 * tierces (pistage des joueurs, contenu modifiable après coup) et les autres chemins du site (requêtes GET déclenchées
 * par <img>) sont refusés.
 */
export const imageUrlSchema = z
  .string()
  .max(500_000, 'Image trop lourde.')
  .refine(
    (u) => uploaderOfUrl(u) !== null || isLibraryArt(u) || (DATA_IMAGE_RE.test(u) && process.env.NODE_ENV !== 'production'),
    'URL d’image invalide : téléversez l’image depuis l’éditeur.',
  );

const intIn = (min: number, max: number) => z.number().int().min(min).max(max);

export const themeSchema = z.object({
  skin: z.enum(['arcade', 'premium', 'casual', 'clean', 'classic']).optional(),
  gradient: z.object({ enabled: z.boolean(), c1: hex, c2: hex, style: z.enum(['linear', 'radial']) }),
  grid: z.object({
    width: intIn(GRID_LIMITS.width.min, GRID_LIMITS.width.max),
    height: intIn(GRID_LIMITS.height.min, GRID_LIMITS.height.max),
    margin: intIn(GRID_LIMITS.margin.min, GRID_LIMITS.margin.max),
  }),
}) satisfies z.ZodType<GameTheme>;

export const itemStyleSchema = z.object({
  bgType: z.enum(['solid', 'linear', 'radial']),
  bg1: hex,
  bg2: hex,
  titleColor: hex,
  titleBg: hexOrNone,
  titleOutline: z.boolean(),
  titleShadow: z.boolean(),
  subtitleColor: hex,
  priceColor: hex,
  priceBg: hexOrNone,
  priceOutline: z.boolean(),
  priceShadow: z.boolean(),
  borderWidth: intIn(0, 10),
  borderColor: hex,
  rounded: z.boolean(),
  shadow: z.boolean(),
});

const priceTier = z
  .number()
  .int()
  .refine((v) => PRICE_TIERS_CENTS.includes(v), 'Le prix doit correspondre à un palier.');

/** Limites des nouveaux champs de présentation (migration 0005). */
export const STORE_DESCRIPTION_MAX = 4000;
export const SCREENSHOTS_MAX = 8;
export const ITEM_DESCRIPTION_MAX = 600;

/**
 * Date de promotion optionnelle : chaîne ISO (ou Date), vide/null = sans limite.
 */
const promoDate = z
  .union([z.string(), z.date()])
  .nullable()
  .default(null)
  .transform((v, ctx) => {
    if (v == null || v === '') return null;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'Date de promotion invalide.' });
      return z.NEVER;
    }
    return d;
  });

export const PRODUCT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const itemInputSchema = z
  .object({
    type: z.enum(['consumable', 'non_consumable', 'auto_renewable', 'non_renewing']),
    period: z.enum(['week', 'month', 'year']).default('month'),
    title: z.string().trim().min(1, "Le titre de l'article est obligatoire.").max(80, 'Titre trop long (80 caractères max).'),
    subtitle: z.string().trim().max(80, 'Sous-titre trop long (80 caractères max).').default(''),
    description: z
      .string()
      .trim()
      .max(ITEM_DESCRIPTION_MAX, `Description trop longue (${ITEM_DESCRIPTION_MAX} caractères max).`)
      .default(''),
    keywords: z
      .array(z.string().trim().min(1).max(30, 'Mot-clé trop long (30 caractères max).'))
      .max(10, '10 mots-clés maximum.')
      .default([]),
    productId: z
      .string()
      .trim()
      .regex(PRODUCT_ID_RE, 'Identifiant produit invalide : lettres, chiffres, « _ », « - » ou « . » (64 max).'),
    priceCents: priceTier,
    oldPriceCents: priceTier.nullable().default(null),
    quantity: intIn(1, 1_000_000).default(1),
    models: z
      .array(z.object({ imageUrl: imageUrlSchema.optional(), label: z.string().trim().max(40, 'Libellé de visuel trop long.') }))
      .min(1, 'Au moins un visuel.')
      .max(3, '3 visuels maximum.'),
    layout: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
    style: itemStyleSchema,
    promoStartsAt: promoDate,
    promoEndsAt: promoDate,
  })
  .refine((v) => v.oldPriceCents == null || v.oldPriceCents > v.priceCents, {
    message: "L'ancien prix doit être supérieur au prix.",
    path: ['oldPriceCents'],
  })
  .refine((v) => !v.promoStartsAt || !v.promoEndsAt || v.promoEndsAt.getTime() > v.promoStartsAt.getTime(), {
    message: 'La fin de la promotion doit être postérieure à son début.',
    path: ['promoEndsAt'],
  })
  .refine((v) => (!v.promoStartsAt && !v.promoEndsAt) || v.oldPriceCents != null, {
    message: 'Une promotion programmée nécessite un ancien prix (barré).',
    path: ['oldPriceCents'],
  });
export type ItemInput = z.input<typeof itemInputSchema>;

export const gameInfoSchema = z
  .object({
    name: z.string().trim().min(1, 'Le nom est obligatoire.').max(60, 'Nom trop long (60 caractères max).'),
    subtitle: z.string().trim().max(100, 'Sous-titre trop long (100 caractères max).'),
    publisherName: z.string().trim().max(60, 'Nom d’éditeur trop long (60 caractères max).'),
    iconUrl: imageUrlSchema.nullable(),
    bannerUrl: imageUrlSchema.nullable(),
    theme: themeSchema,
    storeDescription: z
      .string()
      .trim()
      .max(STORE_DESCRIPTION_MAX, `Présentation trop longue (${STORE_DESCRIPTION_MAX} caractères max).`),
    screenshots: z
      .array(imageUrlSchema)
      .max(SCREENSHOTS_MAX, `${SCREENSHOTS_MAX} captures d’écran maximum.`)
      .refine((l) => new Set(l).size === l.length, 'Cette capture d’écran est déjà présente.'),
  })
  .partial();
export type GameInfoInput = z.input<typeof gameInfoSchema>;

export const newGameSchema = z.object({
  name: z.string().trim().min(1, 'Le nom du jeu est obligatoire.').max(60, 'Nom trop long (60 caractères max).'),
  category: z.enum(GAME_CATEGORIES, { error: 'Catégorie inconnue.' }),
  currency: z.enum(['EUR', 'USD', 'GBP'], { error: 'Devise inconnue.' }),
});
export type NewGameInput = z.input<typeof newGameSchema>;

/** Première erreur zod, lisible. */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new StudioError(r.error.issues[0]?.message ?? 'Données invalides.');
  return r.data;
}

/* ------------------------------------------------------------------ */
/* Jeux                                                               */
/* ------------------------------------------------------------------ */

const CREATOR_ROLES = ['owner', 'admin', 'developer'] as const;

/** Studio dans lequel l'utilisateur peut créer un jeu (le premier dont il est owner/admin/developer). */
export async function findCreatorStudio(database: DB, userId: string) {
  const rows = await database
    .select({ id: studios.id, name: studios.name, role: studioMembers.role })
    .from(studioMembers)
    .innerJoin(studios, eq(studios.id, studioMembers.studioId))
    .where(eq(studioMembers.userId, userId))
    .orderBy(asc(studioMembers.createdAt));
  return rows.find((r) => (CREATOR_ROLES as readonly string[]).includes(r.role)) ?? null;
}

async function uniqueSlug(database: DB, base: string) {
  const root = slugify(base) || 'jeu';
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const [hit] = await database.select({ id: games.id }).from(games).where(eq(games.slug, candidate));
    if (!hit) return candidate;
  }
  return `${root}-${newId('x').slice(2, 8).toLowerCase()}`;
}

/**
 * Crée un jeu en brouillon pour le studio de l'utilisateur. Renvoie la clé API en clair :
 * elle n'est jamais stockée (seule son empreinte l'est) et ne doit être affichée qu'une fois.
 */
export async function createGameFor(database: DB, userId: string, input: NewGameInput) {
  const data = parseOrThrow(newGameSchema, input);
  const studio = await findCreatorStudio(database, userId);
  if (!studio) throw new StudioError("Vous devez d'abord créer ou rejoindre un studio.");

  // Clé secrète au format actuel (`das_secret_…`, D-05) et clé publique (`das_pub_…`) générées dès la création :
  // un jeu sans serveur peut intégrer le SDK client sans passer par une génération différée.
  const { key: apiKey, hash: apiKeyHash, prefix: apiKeyPrefix } = generateSecretApiKey();
  const id = newId('gam');
  const [game] = await database
    .insert(games)
    .values({
      id,
      studioId: studio.id,
      slug: await uniqueSlug(database, data.name),
      name: data.name,
      publisherName: studio.name,
      category: data.category,
      currency: data.currency,
      theme: DEFAULT_THEME,
      status: 'draft',
      webhookSecret: randomToken('whsec_'),
      apiKeyHash,
      apiKeyPrefix,
      publishableKey: generatePublishableKey(),
    })
    .returning();
  return { game: game!, apiKey };
}

export async function getGame(database: DB, gameId: string) {
  const [g] = await database.select().from(games).where(eq(games.id, gameId));
  if (!g) throw new StudioError('Jeu introuvable.');
  return g;
}

/**
 * Multi-tenant (T-MT-02) : une image téléversée ne peut être rattachée qu'à un jeu du studio de son auteur.
 * Les URL déjà présentes sur la ressource (`previous`) ne sont pas revérifiées (ancien membre, visuels de démo).
 */
export async function assertUploadsBelongToGameStudio(
  database: DB,
  gameId: string,
  urls: (string | null | undefined)[],
  previous: (string | null | undefined)[] = [],
) {
  const known = new Set(previous.filter(Boolean));
  const uploaders = new Set<string>();
  for (const u of urls) {
    if (!u || known.has(u)) continue;
    const seg = uploaderOfUrl(u);
    if (seg) uploaders.add(seg);
  }
  if (!uploaders.size) return;
  const members = await database
    .select({ userId: studioMembers.userId })
    .from(studioMembers)
    .innerJoin(games, eq(games.studioId, studioMembers.studioId))
    .where(eq(games.id, gameId));
  const allowed = new Set(members.map((m) => uploaderSegment(m.userId)));
  for (const seg of uploaders) {
    if (!allowed.has(seg)) throw new StudioError('Image introuvable : téléversez-la depuis l’éditeur de ce studio.');
  }
}

export async function updateGameInfo(database: DB, gameId: string, input: GameInfoInput) {
  const data = parseOrThrow(gameInfoSchema, input);
  if (!Object.keys(data).length) return getGame(database, gameId);
  if (data.iconUrl !== undefined || data.bannerUrl !== undefined || data.screenshots !== undefined) {
    const current = await getGame(database, gameId);
    await assertUploadsBelongToGameStudio(
      database,
      gameId,
      [data.iconUrl, data.bannerUrl, ...(data.screenshots ?? [])],
      [current.iconUrl, current.bannerUrl, ...current.screenshots],
    );
  }
  const [g] = await database.update(games).set({ ...data, updatedAt: new Date() }).where(eq(games.id, gameId)).returning();
  if (!g) throw new StudioError('Jeu introuvable.');
  return g;
}

/** Phase 1 : la soumission publie directement (draft → live). */
export async function setGameStatus(database: DB, gameId: string, status: 'draft' | 'live') {
  const g = await getGame(database, gameId);
  if (g.status === 'suspended') throw new StudioError('Ce jeu est suspendu : contactez le support.');
  if (status === 'live') {
    const [{ n }] = (await database
      .select({ n: count() })
      .from(items)
      .where(and(eq(items.gameId, gameId), eq(items.active, true)))) as [{ n: number }];
    if (!n) throw new StudioError('Ajoutez au moins un article avant de publier la boutique.');
  }
  // Revue de sécurité A-02 : écriture conditionnelle — une suspension posée entre la lecture et l'écriture n'est jamais écrasée.
  const [row] = await database
    .update(games)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(games.id, gameId), inArray(games.status, ['draft', 'live'])))
    .returning();
  if (!row) throw new StudioError('Le statut du jeu vient de changer : rechargez la page.');
  return row;
}

/** Supprime le jeu. Refusé s'il a déjà des commandes (historique comptable à conserver). */
export async function deleteGameById(database: DB, gameId: string) {
  await getGame(database, gameId);
  const [{ n }] = (await database.select({ n: count() }).from(orders).where(eq(orders.gameId, gameId))) as [{ n: number }];
  if (n) throw new StudioError('Ce jeu a déjà des ventes : il ne peut pas être supprimé. Repassez-le en brouillon pour le retirer du catalogue.');
  await database.delete(games).where(eq(games.id, gameId));
}

/* ------------------------------------------------------------------ */
/* Articles                                                           */
/* ------------------------------------------------------------------ */

/** Articles actifs de la boutique, dans l'ordre d'affichage. */
export async function listItems(database: DB, gameId: string) {
  return database
    .select()
    .from(items)
    .where(and(eq(items.gameId, gameId), eq(items.active, true)))
    .orderBy(asc(items.position), asc(items.createdAt));
}

async function getItemOfGame(database: DB, gameId: string, itemId: string) {
  const [it] = await database.select().from(items).where(and(eq(items.id, itemId), eq(items.gameId, gameId)));
  if (!it) throw new StudioError('Article introuvable.');
  return it;
}

async function assertProductIdFree(database: DB, gameId: string, productId: string, exceptItemId?: string) {
  const [hit] = await database
    .select({ id: items.id, active: items.active })
    .from(items)
    .where(and(eq(items.gameId, gameId), eq(items.productId, productId)));
  if (hit && hit.id !== exceptItemId) {
    throw new StudioError(
      hit.active
        ? 'Cet identifiant produit est déjà utilisé dans ce jeu.'
        : 'Cet identifiant produit appartient à un article archivé (déjà vendu) de ce jeu.',
    );
  }
}

function isUniqueViolation(e: unknown) {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === '23505' || err?.cause?.code === '23505';
}

function normalizeItem(data: z.output<typeof itemInputSchema>) {
  const isSub = data.type === 'auto_renewable' || data.type === 'non_renewing';
  const seen = new Set<string>();
  const keywords = data.keywords.filter((k) => {
    const key = k.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    ...data,
    keywords,
    period: isSub ? data.period : ('month' as const),
    models: data.models.map((m) => (m.imageUrl ? { imageUrl: m.imageUrl, label: m.label } : { label: m.label })),
  };
}

/**
 * Refuse un prix sous le minimum accepté par Stripe pour la devise du jeu (ex. palier 0,49 en EUR/USD) : l'article
 * serait publié mais tout achat échouerait (revue 2026-11, C-5).
 */
export function assertChargeablePrice(currency: Currency, priceCents: number): void {
  const min = MIN_CHARGE_CENTS[currency];
  if (priceCents < min) {
    throw new StudioError(`Prix trop bas pour le paiement en ligne : ${(min / 100).toFixed(2).replace('.', ',')} ${currency} minimum dans cette devise.`);
  }
}

export async function createItemFor(database: DB, gameId: string, input: ItemInput) {
  const data = normalizeItem(parseOrThrow(itemInputSchema, input));
  assertChargeablePrice((await getGame(database, gameId)).currency, data.priceCents);
  await assertUploadsBelongToGameStudio(database, gameId, data.models.map((m) => m.imageUrl));
  await assertProductIdFree(database, gameId, data.productId);
  const current = await listItems(database, gameId);
  const position = current.length ? Math.max(...current.map((i) => i.position)) + 1 : 0;
  try {
    const [row] = await database
      .insert(items)
      .values({ id: newId('itm'), gameId, position, ...data })
      .returning();
    return row!;
  } catch (e) {
    if (isUniqueViolation(e)) throw new StudioError('Cet identifiant produit est déjà utilisé dans ce jeu.');
    throw e;
  }
}

export async function updateItemFor(database: DB, gameId: string, itemId: string, input: ItemInput) {
  const data = normalizeItem(parseOrThrow(itemInputSchema, input));
  const existing = await getItemOfGame(database, gameId, itemId);
  if (!existing.active) throw new StudioError('Article archivé : il ne peut plus être modifié.');
  assertChargeablePrice((await getGame(database, gameId)).currency, data.priceCents);
  await assertUploadsBelongToGameStudio(
    database,
    gameId,
    data.models.map((m) => m.imageUrl),
    existing.models.map((m) => m.imageUrl),
  );
  if (data.productId !== existing.productId) {
    await assertProductIdFree(database, gameId, data.productId, itemId);
  }
  try {
    const [row] = await database
      .update(items)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(items.id, itemId), eq(items.gameId, gameId)))
      .returning();
    return row!;
  } catch (e) {
    if (isUniqueViolation(e)) throw new StudioError('Cet identifiant produit est déjà utilisé dans ce jeu.');
    throw e;
  }
}

/**
 * Supprime un article. S'il a déjà été vendu, il est archivé (active=false) pour conserver
 * l'historique des commandes ; il disparaît de la boutique dans les deux cas.
 */
export async function deleteItemFor(database: DB, gameId: string, itemId: string) {
  await getItemOfGame(database, gameId, itemId);
  const [{ n }] = (await database.select({ n: count() }).from(orders).where(eq(orders.itemId, itemId))) as [{ n: number }];
  // Défense en profondeur : chaque écriture reste bornée au jeu autorisé (T-MT-02).
  const ofGame = and(eq(items.id, itemId), eq(items.gameId, gameId));
  if (n) {
    await database.update(items).set({ active: false, updatedAt: new Date() }).where(ofGame);
    return { archived: true };
  }
  await database.delete(items).where(ofGame);
  return { archived: false };
}

/** Échange l'article avec son voisin (« up » = plus tôt dans la grille) et renumérote 0..n-1. */
export async function moveItemFor(database: DB, gameId: string, itemId: string, direction: 'up' | 'down') {
  const list = await listItems(database, gameId);
  const idx = list.findIndex((i) => i.id === itemId);
  if (idx < 0) throw new StudioError('Article introuvable.');
  const target = direction === 'up' ? idx - 1 : idx + 1;
  const order = list.map((i) => i.id);
  if (target >= 0 && target < order.length) [order[idx], order[target]] = [order[target]!, order[idx]!];
  await writeOrder(database, gameId, order, list);
  return order;
}

/** Applique un ordre complet (liste d'identifiants d'articles actifs du jeu). */
export async function reorderItemsFor(database: DB, gameId: string, orderedIds: string[]) {
  const ids = parseOrThrow(z.array(z.string().min(1)).max(500), orderedIds);
  const list = await listItems(database, gameId);
  const known = new Set(list.map((i) => i.id));
  if (ids.length !== list.length || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
    throw new StudioError("L'ordre fourni ne correspond pas aux articles de la boutique.");
  }
  await writeOrder(database, gameId, ids, list);
  return ids;
}

async function writeOrder(database: DB, gameId: string, order: string[], list: ItemRow[]) {
  const pos = new Map(list.map((i) => [i.id, i.position]));
  for (const [i, id] of order.entries()) {
    if (pos.get(id) === i) continue;
    await database.update(items).set({ position: i }).where(and(eq(items.id, id), eq(items.gameId, gameId)));
  }
}

/* ------------------------------------------------------------------ */
/* Tableau de bord « Mes jeux »                                       */
/* ------------------------------------------------------------------ */

/** Jeux des studios de l'utilisateur, avec nombre d'articles actifs et revenu brut payé sur 30 jours. */
export async function listStudioGames(database: DB, userId: string, now = new Date()) {
  const rows = await database
    .select({
      id: games.id,
      slug: games.slug,
      name: games.name,
      publisherName: games.publisherName,
      iconUrl: games.iconUrl,
      status: games.status,
      currency: games.currency,
      category: games.category,
      createdAt: games.createdAt,
    })
    .from(games)
    .innerJoin(studioMembers, and(eq(studioMembers.studioId, games.studioId), eq(studioMembers.userId, userId)))
    .orderBy(asc(games.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const itemCounts = await database
    .select({ gameId: items.gameId, n: count() })
    .from(items)
    .where(and(inArray(items.gameId, ids), eq(items.active, true)))
    .groupBy(items.gameId);
  const revenue = await database
    .select({ gameId: orders.gameId, cents: sum(orders.amountCents) })
    .from(orders)
    .where(and(inArray(orders.gameId, ids), eq(orders.status, 'paid'), gte(orders.createdAt, since)))
    .groupBy(orders.gameId);
  const nItems = new Map(itemCounts.map((r) => [r.gameId, Number(r.n)]));
  const rev = new Map(revenue.map((r) => [r.gameId, Number(r.cents ?? 0)]));
  return rows.map((r) => ({ ...r, itemCount: nItems.get(r.id) ?? 0, revenue30dCents: rev.get(r.id) ?? 0 }));
}
