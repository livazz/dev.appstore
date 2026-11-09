import 'server-only';
import { createPrivateKey } from 'node:crypto';
import { z } from 'zod';
import { DEFAULT_ITEM_STYLE, PRICE_TIERS_CENTS, newId, type Currency, type ItemType, type Period } from '@wolleen/core';
import {
  and,
  desc,
  eq,
  games,
  importRuns,
  items,
  storeCredentials,
  type DB,
  type ImportRunWarning,
  type StoreSource,
} from '@wolleen/db';
import {
  DEFAULT_WEB_DISCOUNT_BPS,
  importCatalog,
  normalizePem,
  parseServiceAccount,
  suggestWebPrice,
  type AppStoreImportOptions,
  type FetchLike,
  type GooglePlayImportOptions,
  type ImportedProduct,
  type ImportWarning,
} from '@wolleen/importers';
import { decryptJson, encryptJson, SecretDecryptError } from './secrets';
import { demoImportOptions } from './import-demo';
import { PRODUCT_ID_RE, StudioError, createItemFor } from './studio-logic';

/*
 * Import du catalogue in-app depuis App Store Connect / Google Play (page /studio/games/[id]/import).
 * Fonctions pures vis-à-vis de la session : elles reçoivent la base et un gameId déjà autorisé.
 * Les Server Actions de `import-actions.ts` vérifient les droits (requireGameAccess) puis délèguent ici.
 */

/* ------------------------------------------------------------------ */
/* Identifiants                                                        */
/* ------------------------------------------------------------------ */

function isPrivateKey(pem: string) {
  try {
    createPrivateKey(normalizePem(pem));
    return true;
  } catch {
    return false;
  }
}

export const appStoreCredentialsSchema = z.object({
  issuerId: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, 'Issuer ID invalide (UUID affiché en haut de la page des clés).'),
  keyId: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{10}$/, 'Key ID invalide (10 caractères, ex. 2X9R4HXF34).'),
  privateKey: z
    .string()
    .trim()
    .min(40, 'Collez le contenu du fichier AuthKey_<KEY_ID>.p8.')
    .max(10_000, 'Clé trop longue.')
    .refine(isPrivateKey, 'Clé .p8 illisible : collez le contenu complet du fichier AuthKey_<KEY_ID>.p8.'),
  appId: z
    .string()
    .trim()
    .regex(/^\d{6,15}$/, "Apple ID de l'app invalide (nombre, ex. 1561234567 ; ce n'est pas le bundle id)."),
});
export type AppStoreCredentialsInput = z.input<typeof appStoreCredentialsSchema>;
export type AppStoreStored = z.output<typeof appStoreCredentialsSchema>;

export const googlePlayCredentialsSchema = z.object({
  packageName: z
    .string()
    .trim()
    .regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/, 'Nom de package invalide (ex. com.studio.jeu).')
    .max(150),
  serviceAccount: z
    .string()
    .trim()
    .max(20_000, 'Fichier JSON trop long.')
    .superRefine((raw, ctx) => {
      try {
        const sa = parseServiceAccount(raw);
        if (!isPrivateKey(sa.private_key)) ctx.addIssue({ code: 'custom', message: 'Clé privée du compte de service illisible.' });
      } catch {
        ctx.addIssue({ code: 'custom', message: 'JSON du compte de service invalide : collez le fichier de clé téléchargé depuis Google Cloud.' });
      }
    }),
});
export type GooglePlayCredentialsInput = z.input<typeof googlePlayCredentialsSchema>;
export type GooglePlayStored = z.output<typeof googlePlayCredentialsSchema>;

export const storeSourceSchema = z.enum(['app_store', 'google_play']);

/** Ce que le navigateur voit des identifiants enregistrés : jamais le secret, seulement un rappel. */
export interface CredentialSummary {
  source: StoreSource;
  hint: string;
  updatedAt: string;
}
export type CredentialStatus = Record<StoreSource, CredentialSummary | null>;

interface SecretOpts {
  key?: Buffer;
}

const aad = (gameId: string, source: StoreSource) => `${gameId}:${source}`;

function hintOf(source: StoreSource, data: AppStoreStored | GooglePlayStored): string {
  if (source === 'app_store') {
    const d = data as AppStoreStored;
    return `Key ID ${d.keyId} · app ${d.appId}`;
  }
  const d = data as GooglePlayStored;
  const email = parseServiceAccount(d.serviceAccount).client_email;
  return `${d.packageName} · ${email}`;
}

/** Valide puis enregistre (chiffrés) les identifiants d'un store pour un jeu. Remplace les précédents. */
export async function saveStoreCredentials(database: DB, gameId: string, source: StoreSource, input: unknown, opts: SecretOpts = {}) {
  const schema = source === 'app_store' ? appStoreCredentialsSchema : googlePlayCredentialsSchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new StudioError(parsed.error.issues[0]?.message ?? 'Identifiants invalides.');
  const data = parsed.data;
  if (source === 'google_play') {
    // On ne garde que les champs utiles du JSON (pas de champs arbitraires stockés).
    const sa = parseServiceAccount((data as GooglePlayStored).serviceAccount);
    (data as GooglePlayStored).serviceAccount = JSON.stringify({
      type: sa.type ?? 'service_account',
      project_id: sa.project_id,
      private_key_id: sa.private_key_id,
      private_key: sa.private_key,
      client_email: sa.client_email,
      token_uri: sa.token_uri,
    });
  }
  const enc = encryptJson(data, { aad: aad(gameId, source), key: opts.key });
  const hint = hintOf(source, data);
  const now = new Date();
  await database
    .insert(storeCredentials)
    .values({ id: newId('scr'), gameId, source, ...enc, hint, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [storeCredentials.gameId, storeCredentials.source], set: { ...enc, hint, updatedAt: now } });
  return getCredentialStatus(database, gameId);
}

export async function deleteStoreCredentials(database: DB, gameId: string, source: StoreSource) {
  await database.delete(storeCredentials).where(and(eq(storeCredentials.gameId, gameId), eq(storeCredentials.source, source)));
  return getCredentialStatus(database, gameId);
}

export async function getCredentialStatus(database: DB, gameId: string): Promise<CredentialStatus> {
  const rows = await database
    .select({ source: storeCredentials.source, hint: storeCredentials.hint, updatedAt: storeCredentials.updatedAt })
    .from(storeCredentials)
    .where(eq(storeCredentials.gameId, gameId));
  const out: CredentialStatus = { app_store: null, google_play: null };
  for (const r of rows) out[r.source] = { source: r.source, hint: r.hint, updatedAt: r.updatedAt.toISOString() };
  return out;
}

/** Déchiffre les identifiants enregistrés (usage serveur uniquement). */
export async function loadStoreCredentials(
  database: DB,
  gameId: string,
  opts: SecretOpts = {},
): Promise<{ appStore?: AppStoreStored; googlePlay?: GooglePlayStored }> {
  const rows = await database.select().from(storeCredentials).where(eq(storeCredentials.gameId, gameId));
  const out: { appStore?: AppStoreStored; googlePlay?: GooglePlayStored } = {};
  for (const r of rows) {
    try {
      const data = decryptJson<AppStoreStored & GooglePlayStored>(r, { aad: aad(gameId, r.source), key: opts.key });
      if (r.source === 'app_store') out.appStore = data;
      else out.googlePlay = data;
    } catch (e) {
      if (e instanceof SecretDecryptError) {
        const label = r.source === 'app_store' ? 'App Store Connect' : 'Google Play';
        throw new StudioError(`Identifiants ${label} illisibles (secret de l'application changé ?) : saisissez-les de nouveau.`);
      }
      throw e;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Aperçu du catalogue                                                 */
/* ------------------------------------------------------------------ */

const MIN_TIER = PRICE_TIERS_CENTS[0]!;
const MAX_TIER = PRICE_TIERS_CENTS[PRICE_TIERS_CENTS.length - 1]!;

/** Pays des prix importés, déduit de la devise du jeu. */
export function regionFor(currency: Currency): { regionCode: 'FR' | 'US' | 'GB'; territory: 'FRA' | 'USA' | 'GBR'; label: string } {
  if (currency === 'USD') return { regionCode: 'US', territory: 'USA', label: 'États-Unis' };
  if (currency === 'GBP') return { regionCode: 'GB', territory: 'GBR', label: 'Royaume-Uni' };
  return { regionCode: 'FR', territory: 'FRA', label: 'France' };
}

/** Identifiant produit accepté par Wolleen (ex. Google « vip:monthly » → « vip.monthly »). Le jeu doit reconnaître ce nouvel id. */
export function toWolleenProductId(storeId: string): string {
  if (PRODUCT_ID_RE.test(storeId)) return storeId;
  let s = storeId.replace(/[^A-Za-z0-9._-]+/g, '.').replace(/^[^A-Za-z0-9]+/, '');
  s = s.slice(0, 64);
  return s || 'produit';
}

/** Prix web proposé, ramené dans la grille des paliers Wolleen (49 → 9 999 centimes). */
export function priceForWeb(storePriceCents: number, discountBps: number): { suggestedCents: number | null; webPriceCents: number; note?: string } {
  const suggestedCents = suggestWebPrice(storePriceCents, discountBps);
  if (suggestedCents === null) {
    return { suggestedCents, webPriceCents: MIN_TIER, note: 'Prix store trop bas pour la remise : palier minimal proposé.' };
  }
  if (suggestedCents > MAX_TIER) {
    return { suggestedCents, webPriceCents: MAX_TIER, note: 'Au-delà du palier le plus élevé (99,99) : ramené à 99,99.' };
  }
  // Les paliers bas sont espacés (0,49 → 0,99) : l'arrondi au palier inférieur peut doubler la remise demandée.
  const effectiveBps = Math.round((1 - suggestedCents / storePriceCents) * 10_000);
  if (effectiveBps - discountBps > 1000) {
    return { suggestedCents, webPriceCents: suggestedCents, note: `Remise réelle −${Math.round(effectiveBps / 100)} % à cause des paliers : ajustez si besoin.` };
  }
  return { suggestedCents, webPriceCents: suggestedCents };
}

/** Prix barré : le prix store, s'il fait partie des paliers et dépasse le prix web. */
export function strikePrice(storePriceCents: number, webPriceCents: number): number | null {
  return PRICE_TIERS_CENTS.includes(storePriceCents) && storePriceCents > webPriceCents ? storePriceCents : null;
}

/** Quantité devinée depuis l'identifiant (« gems_1200 » → 1 200) pour les consommables, sinon 1. */
export function guessQuantity(productId: string, type: ItemType): number {
  if (type !== 'consumable') return 1;
  const m = /(?:^|[._-])(\d{2,7})$/.exec(productId);
  const n = m ? Number(m[1]) : 1;
  return n >= 2 && n <= 1_000_000 ? n : 1;
}

const clip = (s: string | undefined, max = 80) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

export interface PreviewRow {
  /** Clé stable de la ligne (source + id store). */
  key: string;
  source: StoreSource;
  storeProductId: string;
  /** Identifiant qui sera utilisé dans Wolleen (identique au store sauf caractères non acceptés). */
  productId: string;
  type: ItemType;
  period: Period | null;
  title: string;
  subtitle: string;
  storePriceCents: number;
  storeCurrency: Currency;
  suggestedCents: number | null;
  webPriceCents: number;
  quantity: number;
  /** Article déjà présent dans le jeu avec ce product_id (actif ou archivé). */
  existing: 'active' | 'archived' | null;
  /** Cochée par défaut. */
  preselected: boolean;
  notes: string[];
}

export function buildPreviewRows(
  products: ImportedProduct[],
  existing: Map<string, boolean>,
  gameCurrency: Currency,
  discountBps: number,
  warnings: ImportWarning[] = [],
): PreviewRow[] {
  const seen = new Set<string>();
  return products.map((p) => {
    const notes: string[] = [];
    const productId = toWolleenProductId(p.productId);
    if (productId !== p.productId) notes.push(`Identifiant adapté (« ${p.productId} » → « ${productId} ») : le jeu doit reconnaître ce nouvel id.`);
    const dup = seen.has(productId);
    seen.add(productId);
    if (dup) notes.push('Identifiant en double dans le catalogue importé.');
    const price = priceForWeb(p.priceCents, discountBps);
    if (price.note) notes.push(price.note);
    if (p.currency !== gameCurrency) notes.push(`Prix store en ${p.currency}, boutique en ${gameCurrency} : vérifiez le prix web.`);
    const isSub = p.type === 'auto_renewable' || p.type === 'non_renewing';
    let period: Period | null = isSub ? (p.period ?? null) : null;
    if (isSub && !period) {
      period = 'month';
      notes.push('Période non gérée par Wolleen : « mois » proposé, à vérifier.');
    }
    for (const w of warnings) {
      if (w.productId === p.productId && w.source === p.source && w.code !== 'inactive' && w.code !== 'unsupported_period') notes.push(w.message);
    }
    const hit = existing.get(productId);
    const ex = hit === undefined ? null : hit ? 'active' : 'archived';
    const unsure = dup || p.currency !== gameCurrency || (isSub && !p.period);
    return {
      key: `${p.source}:${p.productId}`,
      source: p.source,
      storeProductId: p.productId,
      productId,
      type: p.type,
      period,
      title: clip(p.title) || productId,
      subtitle: clip(p.subtitle),
      storePriceCents: p.priceCents,
      storeCurrency: p.currency,
      suggestedCents: price.suggestedCents,
      webPriceCents: price.webPriceCents,
      quantity: guessQuantity(productId, p.type),
      existing: ex,
      preselected: ex === null && !unsure,
      notes,
    };
  });
}

export interface CatalogPreview {
  runId: string;
  mode: 'live' | 'demo';
  sources: StoreSource[];
  currency: Currency;
  regionLabel: string;
  discountBps: number;
  rows: PreviewRow[];
  warnings: ImportWarning[];
}

export const discountBpsSchema = z.number().int().min(0, 'Remise invalide.').max(9000, 'Remise de 90 % maximum.');

export interface FetchCatalogOptions extends SecretOpts {
  mode: 'live' | 'demo';
  userId?: string | null;
  discountBps?: number;
  /** `fetch` injecté (tests) pour le mode live. */
  fetch?: FetchLike;
  date?: Date;
}

async function existingProductIds(database: DB, gameId: string) {
  const rows = await database.select({ productId: items.productId, active: items.active }).from(items).where(eq(items.gameId, gameId));
  return new Map(rows.map((r) => [r.productId, r.active]));
}

/** Interroge les stores (ou la démo) et prépare l'aperçu ; journalise la récupération dans import_runs. */
export async function fetchCatalogFor(database: DB, gameId: string, opts: FetchCatalogOptions): Promise<CatalogPreview> {
  const discountBps = discountBpsSchema.safeParse(opts.discountBps ?? DEFAULT_WEB_DISCOUNT_BPS);
  if (!discountBps.success) throw new StudioError(discountBps.error.issues[0]?.message ?? 'Remise invalide.');
  const [game] = await database.select({ id: games.id, currency: games.currency }).from(games).where(eq(games.id, gameId));
  if (!game) throw new StudioError('Jeu introuvable.');
  const region = regionFor(game.currency);

  let options: { appStore?: AppStoreImportOptions; googlePlay?: GooglePlayImportOptions };
  if (opts.mode === 'demo') {
    options = demoImportOptions(region.regionCode);
  } else {
    const creds = await loadStoreCredentials(database, gameId, opts);
    options = {};
    if (creds.appStore) {
      const { appId, ...credentials } = creds.appStore;
      options.appStore = { credentials, appId, territory: region.territory, fetch: opts.fetch, date: opts.date };
    }
    if (creds.googlePlay) {
      options.googlePlay = { serviceAccount: creds.googlePlay.serviceAccount, packageName: creds.googlePlay.packageName, regionCode: region.regionCode, fetch: opts.fetch };
    }
    if (!options.appStore && !options.googlePlay) {
      throw new StudioError("Aucun identifiant enregistré : renseignez App Store Connect et/ou Google Play, ou essayez le catalogue d'exemple.");
    }
  }
  const sources: StoreSource[] = [...(options.appStore ? (['app_store'] as const) : []), ...(options.googlePlay ? (['google_play'] as const) : [])];

  const result = await importCatalog(options);
  const failed = result.warnings.filter((w) => w.code === 'fetch_failed' && !w.productId);
  const allFailed = result.products.length === 0 && failed.length === sources.length;
  const runId = newId('imp');
  await database.insert(importRuns).values({
    id: runId,
    gameId,
    userId: opts.userId ?? null,
    mode: opts.mode,
    sources,
    status: allFailed ? 'failed' : 'fetched',
    productsFound: result.products.length,
    warnings: result.warnings.slice(0, 200) as ImportRunWarning[],
    error: allFailed ? failed.map((w) => w.message).join(' | ').slice(0, 2000) : null,
  });
  if (allFailed) {
    throw new StudioError(`Le catalogue n'a pas pu être lu : ${failed.map((w) => `${w.source === 'app_store' ? 'App Store' : 'Google Play'} — ${w.message}`).join(' ; ')}`);
  }

  const existing = await existingProductIds(database, gameId);
  return {
    runId,
    mode: opts.mode,
    sources,
    currency: game.currency,
    regionLabel: region.label,
    discountBps: discountBps.data,
    rows: buildPreviewRows(result.products, existing, game.currency, discountBps.data, result.warnings),
    warnings: result.warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Import de la sélection                                              */
/* ------------------------------------------------------------------ */

export const importSelectionSchema = z.object({
  runId: z.string().min(1).max(64),
  showStorePrice: z.boolean().default(true),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(64),
        type: z.enum(['consumable', 'non_consumable', 'auto_renewable', 'non_renewing']),
        period: z.enum(['week', 'month', 'year']).nullable().default(null),
        title: z.string(),
        subtitle: z.string().default(''),
        storePriceCents: z.number().int().positive().max(10_000_000),
        priceCents: z.number().int(),
        quantity: z.number().int().min(1).max(1_000_000).default(1),
      }),
    )
    .min(1, 'Sélectionnez au moins un article.')
    .max(500, '500 articles maximum par import.'),
});
export type ImportSelectionInput = z.input<typeof importSelectionSchema>;

export interface ImportOutcome {
  created: { productId: string; itemId: string; title: string }[];
  skipped: { productId: string; reason: string }[];
}

/**
 * Crée les articles sélectionnés (style par défaut, mise en page 4), via le service d'articles de l'éditeur
 * (mêmes validations : paliers de prix, identifiant produit unique dans le jeu). Un article en erreur
 * n'empêche pas les autres : il est renvoyé dans `skipped` avec la raison.
 */
export async function importSelectionFor(database: DB, gameId: string, input: unknown): Promise<ImportOutcome> {
  const parsed = importSelectionSchema.safeParse(input);
  if (!parsed.success) throw new StudioError(parsed.error.issues[0]?.message ?? 'Sélection invalide.');
  const { runId, items: selection, showStorePrice } = parsed.data;
  const [run] = await database.select().from(importRuns).where(and(eq(importRuns.id, runId), eq(importRuns.gameId, gameId)));
  if (!run) throw new StudioError("Récupération du catalogue introuvable : relancez « Récupérer le catalogue ».");

  const out: ImportOutcome = { created: [], skipped: [] };
  for (const it of selection) {
    try {
      const isSub = it.type === 'auto_renewable' || it.type === 'non_renewing';
      const row = await createItemFor(database, gameId, {
        type: it.type,
        period: isSub ? (it.period ?? 'month') : 'month',
        title: clip(it.title),
        subtitle: clip(it.subtitle),
        keywords: [],
        productId: it.productId,
        priceCents: it.priceCents,
        oldPriceCents: showStorePrice ? strikePrice(it.storePriceCents, it.priceCents) : null,
        quantity: it.quantity,
        models: [{ label: '' }],
        layout: 4,
        style: DEFAULT_ITEM_STYLE,
      });
      out.created.push({ productId: row.productId, itemId: row.id, title: row.title });
    } catch (e) {
      if (e instanceof StudioError) out.skipped.push({ productId: it.productId, reason: e.message });
      else throw e;
    }
  }
  await database
    .update(importRuns)
    .set({ status: out.created.length ? 'imported' : run.status, itemsCreated: run.itemsCreated + out.created.length, importedAt: new Date() })
    .where(eq(importRuns.id, runId));
  return out;
}

/* ------------------------------------------------------------------ */
/* Journal                                                             */
/* ------------------------------------------------------------------ */

export async function listImportRuns(database: DB, gameId: string, limit = 10) {
  return database
    .select({
      id: importRuns.id,
      mode: importRuns.mode,
      sources: importRuns.sources,
      status: importRuns.status,
      productsFound: importRuns.productsFound,
      itemsCreated: importRuns.itemsCreated,
      warningsCount: importRuns.warnings,
      error: importRuns.error,
      createdAt: importRuns.createdAt,
    })
    .from(importRuns)
    .where(eq(importRuns.gameId, gameId))
    .orderBy(desc(importRuns.createdAt))
    .limit(limit)
    .then((rows) => rows.map((r) => ({ ...r, warningsCount: r.warningsCount.length })));
}
