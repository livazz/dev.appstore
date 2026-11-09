import type { ItemType } from '@devappstore/core';
import { applePeriod } from '../periods';
import { decimalToCents, toCurrency } from '../pricing';
import { mapLimit, pickLocale, StoreApiError } from '../http';
import type { ImportedProduct, ImportResult, ImportWarning } from '../types';
import {
  AppStoreConnectClient,
  indexIncluded,
  relIds,
  type AppStoreConnectClientOptions,
  type AppStoreConnectCredentials,
  type JsonApiResource,
} from './client';

export interface AppStoreImportOptions extends AppStoreConnectClientOptions {
  credentials: AppStoreConnectCredentials;
  /** « Apple ID » numérique de l'app (App Store Connect → Informations sur l'app). */
  appId: string;
  /** Territoire App Store, code ISO 3166-1 alpha-3 (`FRA`, `USA`, `GBR`…). Défaut `FRA`. */
  territory?: string;
  /** Langue préférée pour les noms affichés (défaut `fr-FR`). */
  locale?: string;
  /** Inclure les produits retirés de la vente / rejetés (défaut false). */
  includeRemoved?: boolean;
  /** Appels simultanés pour les prix (défaut 4). */
  concurrency?: number;
  /** Date de référence pour choisir le prix en vigueur (défaut maintenant). */
  date?: Date;
}

const REMOVED_STATES = new Set(['DEVELOPER_REMOVED_FROM_SALE', 'REMOVED_FROM_SALE', 'REJECTED']);

const IAP_TYPES: Record<string, ItemType> = {
  CONSUMABLE: 'consumable',
  NON_CONSUMABLE: 'non_consumable',
  NON_RENEWING_SUBSCRIPTION: 'non_renewing',
};

interface IapAttributes {
  name?: string;
  productId?: string;
  inAppPurchaseType?: string;
  state?: string;
}
interface SubscriptionAttributes {
  name?: string;
  productId?: string;
  subscriptionPeriod?: string;
  state?: string;
  groupLevel?: number;
}
interface LocalizationAttributes {
  name?: string;
  description?: string;
  locale?: string;
}
interface PriceAttributes {
  startDate?: string | null;
  endDate?: string | null;
  planType?: string | null;
}

interface ResolvedPrice {
  cents: number;
  currencyCode: string;
}

/**
 * Importe le catalogue in-app d'une app App Store :
 * - achats intégrés v2 (`GET /v1/apps/{id}/inAppPurchasesV2`) + localisations + grille de prix
 *   (`/v2/inAppPurchases/{id}/iapPriceSchedule` → `manualPrices` puis `automaticPrices` filtrés par territoire) ;
 * - abonnements auto-renouvelables (`/v1/apps/{id}/subscriptionGroups` → `/v1/subscriptionGroups/{id}/subscriptions`
 *   → `/v1/subscriptions/{id}/prices`).
 */
export async function importAppStoreCatalog(opts: AppStoreImportOptions): Promise<ImportResult> {
  const client = new AppStoreConnectClient(opts.credentials, opts);
  const territory = (opts.territory ?? 'FRA').toUpperCase();
  const locale = opts.locale ?? 'fr-FR';
  const concurrency = opts.concurrency ?? 4;
  const day = (opts.date ?? new Date()).toISOString().slice(0, 10);
  const warnings: ImportWarning[] = [];
  const warn = (w: Omit<ImportWarning, 'source'>) => warnings.push({ source: 'app_store', ...w });

  const keep = (state: string | undefined, productId: string) => {
    if (!opts.includeRemoved && state && REMOVED_STATES.has(state)) {
      warn({ productId, code: 'inactive', message: `Ignoré : état « ${state} » sur l'App Store.` });
      return false;
    }
    return true;
  };

  /* ---- Achats intégrés (consommables, non consommables, abonnements non renouvelables) ---- */
  const iaps = await client.getAll<IapAttributes>(`/v1/apps/${encodeURIComponent(opts.appId)}/inAppPurchasesV2`, {
    limit: 200,
    include: 'inAppPurchaseLocalizations,iapPriceSchedule',
    'limit[inAppPurchaseLocalizations]': 50,
    'fields[inAppPurchaseLocalizations]': 'name,locale,description',
  });
  const iapIncluded = indexIncluded(iaps.included);

  const iapProducts = await mapLimit(iaps.data, concurrency, async (iap): Promise<ImportedProduct | null> => {
    const a = iap.attributes ?? {};
    const productId = a.productId ?? iap.id;
    if (!keep(a.state, productId)) return null;
    const type = IAP_TYPES[a.inAppPurchaseType ?? ''];
    if (!type) {
      warn({ productId, code: 'fetch_failed', message: `Type d'achat intégré inconnu : ${a.inAppPurchaseType}` });
      return null;
    }
    const locs = relIds(iap, 'inAppPurchaseLocalizations')
      .map((r) => iapIncluded.get(`${r.type}:${r.id}`) as JsonApiResource<LocalizationAttributes> | undefined)
      .filter((r): r is JsonApiResource<LocalizationAttributes> => !!r);
    const loc = pickLocale(locs, (l) => l.attributes?.locale, locale)?.attributes;

    const scheduleId = relIds(iap, 'iapPriceSchedule')[0]?.id;
    let price: ResolvedPrice | null;
    try {
      price = await iapPrice(client, iap.id, scheduleId, territory, day);
    } catch (e) {
      warn({ productId, code: 'fetch_failed', message: `Prix illisible : ${(e as Error).message}` });
      return null;
    }
    return toProduct({ productId, sourceId: iap.id, type, title: loc?.name || a.name || productId, subtitle: loc?.description, price }, territory, warn);
  });

  /* ---- Abonnements auto-renouvelables ---- */
  const groups = await client.getAll(`/v1/apps/${encodeURIComponent(opts.appId)}/subscriptionGroups`, {
    limit: 200,
    'fields[subscriptionGroups]': 'referenceName',
  });
  const subs: { res: JsonApiResource<SubscriptionAttributes>; included: Map<string, JsonApiResource> }[] = [];
  for (const g of groups.data) {
    const page = await client.getAll<SubscriptionAttributes>(`/v1/subscriptionGroups/${encodeURIComponent(g.id)}/subscriptions`, {
      limit: 200,
      include: 'subscriptionLocalizations',
      'limit[subscriptionLocalizations]': 50,
      'fields[subscriptionLocalizations]': 'name,locale,description',
    });
    const inc = indexIncluded(page.included);
    for (const res of [...page.data].sort((x, y) => (x.attributes?.groupLevel ?? 0) - (y.attributes?.groupLevel ?? 0))) {
      subs.push({ res, included: inc });
    }
  }

  const subProducts = await mapLimit(subs, concurrency, async ({ res, included }): Promise<ImportedProduct | null> => {
    const a = res.attributes ?? {};
    const productId = a.productId ?? res.id;
    if (!keep(a.state, productId)) return null;
    const locs = relIds(res, 'subscriptionLocalizations')
      .map((r) => included.get(`${r.type}:${r.id}`) as JsonApiResource<LocalizationAttributes> | undefined)
      .filter((r): r is JsonApiResource<LocalizationAttributes> => !!r);
    const loc = pickLocale(locs, (l) => l.attributes?.locale, locale)?.attributes;
    const period = applePeriod(a.subscriptionPeriod);
    if (!period) {
      warn({
        productId,
        code: 'unsupported_period',
        message: `Période « ${a.subscriptionPeriod} » non gérée par Dev AppStore (semaine, mois, an) : à ajuster avant publication.`,
      });
    }
    let price: ResolvedPrice | null;
    try {
      price = await subscriptionPrice(client, res.id, territory, day);
    } catch (e) {
      warn({ productId, code: 'fetch_failed', message: `Prix illisible : ${(e as Error).message}` });
      return null;
    }
    return toProduct(
      { productId, sourceId: res.id, type: 'auto_renewable', title: loc?.name || a.name || productId, subtitle: loc?.description, price, period: period ?? undefined },
      territory,
      warn,
    );
  });

  return { products: [...iapProducts, ...subProducts].filter((p): p is ImportedProduct => !!p), warnings };
}

function toProduct(
  p: Omit<ImportedProduct, 'source' | 'priceCents' | 'currency' | 'subtitle'> & { subtitle?: string; price: ResolvedPrice | null },
  territory: string,
  warn: (w: Omit<ImportWarning, 'source'>) => void,
): ImportedProduct | null {
  if (!p.price) {
    warn({ productId: p.productId, code: 'no_price', message: `Aucun prix en vigueur pour le territoire ${territory}.` });
    return null;
  }
  const currency = toCurrency(p.price.currencyCode);
  if (!currency) {
    warn({ productId: p.productId, code: 'unsupported_currency', message: `Devise ${p.price.currencyCode} non gérée (EUR, USD, GBP).` });
    return null;
  }
  const { price, subtitle, ...rest } = p;
  const out: ImportedProduct = { source: 'app_store', ...rest, priceCents: price.cents, currency };
  if (subtitle) out.subtitle = subtitle;
  if (out.period === undefined) delete out.period;
  return out;
}

/** Prix en vigueur à `day` : début ≤ day (null = depuis toujours) et fin > day (null = sans fin), le plus récent gagne. */
export function pickCurrentPrice<T extends JsonApiResource<PriceAttributes>>(prices: readonly T[], day: string): T | undefined {
  return prices
    .filter((p) => {
      const s = p.attributes?.startDate ?? null;
      const e = p.attributes?.endDate ?? null;
      return (s === null || s <= day) && (e === null || e > day);
    })
    .sort((a, b) => (a.attributes?.startDate ?? '').localeCompare(b.attributes?.startDate ?? ''))
    .at(-1);
}

function resolvePrice(
  doc: { data: JsonApiResource<PriceAttributes>[]; included: JsonApiResource[] },
  pricePointRel: string,
  territory: string,
  day: string,
): ResolvedPrice | null {
  const inc = indexIncluded(doc.included);
  const candidates = doc.data.filter((p) => {
    const t = relIds(p, 'territory')[0]?.id;
    return (!t || t.toUpperCase() === territory) && (!p.attributes?.planType || p.attributes.planType === 'UPFRONT');
  });
  const current = pickCurrentPrice(candidates, day);
  if (!current) return null;
  const ppRef = relIds(current, pricePointRel)[0];
  const terrRef = relIds(current, 'territory')[0];
  const pp = ppRef && (inc.get(`${ppRef.type}:${ppRef.id}`) as JsonApiResource<{ customerPrice?: string }> | undefined);
  const terr = terrRef && (inc.get(`${terrRef.type}:${terrRef.id}`) as JsonApiResource<{ currency?: string }> | undefined);
  const cents = decimalToCents(pp?.attributes?.customerPrice);
  const currencyCode = terr?.attributes?.currency;
  if (cents === null || !currencyCode) return null;
  return { cents, currencyCode };
}

async function iapPrice(
  client: AppStoreConnectClient,
  iapId: string,
  scheduleIdHint: string | undefined,
  territory: string,
  day: string,
): Promise<ResolvedPrice | null> {
  let scheduleId = scheduleIdHint;
  if (!scheduleId) {
    const doc = await client.get(`/v2/inAppPurchases/${encodeURIComponent(iapId)}/iapPriceSchedule`);
    scheduleId = Array.isArray(doc.data) ? doc.data[0]?.id : doc.data.id;
    if (!scheduleId) return null;
  }
  const query = {
    'filter[territory]': territory,
    include: 'inAppPurchasePricePoint,territory',
    'fields[inAppPurchasePricePoints]': 'customerPrice',
    'fields[territories]': 'currency',
    limit: 200,
  };
  // Prix fixés à la main pour ce territoire (dont le territoire de base) ; sinon prix générés automatiquement par péréquation.
  for (const kind of ['manualPrices', 'automaticPrices'] as const) {
    try {
      const doc = await client.getAll<PriceAttributes>(`/v1/inAppPurchasePriceSchedules/${encodeURIComponent(scheduleId)}/${kind}`, query);
      const price = resolvePrice(doc, 'inAppPurchasePricePoint', territory, day);
      if (price) return price;
    } catch (e) {
      if (!(e instanceof StoreApiError && e.status === 404)) throw e;
    }
  }
  return null;
}

async function subscriptionPrice(client: AppStoreConnectClient, subscriptionId: string, territory: string, day: string): Promise<ResolvedPrice | null> {
  const doc = await client.getAll<PriceAttributes>(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}/prices`, {
    'filter[territory]': territory,
    include: 'subscriptionPricePoint,territory',
    'fields[subscriptionPricePoints]': 'customerPrice',
    'fields[territories]': 'currency',
    limit: 200,
  });
  return resolvePrice(doc, 'subscriptionPricePoint', territory, day);
}
