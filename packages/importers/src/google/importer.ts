import type { ItemType } from '@devappstore/core';
import { isoPeriod } from '../periods';
import { microsToCents, moneyToCents, toCurrency } from '../pricing';
import { pickLocale, requestJson, type HttpOptions } from '../http';
import type { ImportedProduct, ImportResult, ImportWarning } from '../types';
import { fetchGoogleAccessToken, parseServiceAccount, type GoogleAccessToken, type GoogleServiceAccountKey } from './auth';

export const ANDROID_PUBLISHER_BASE_URL = 'https://androidpublisher.googleapis.com/androidpublisher/v3';

/* ---------- Types de l'API Google Play Developer (sous-ensemble utilisé) ---------- */

interface Money {
  currencyCode?: string;
  units?: string;
  nanos?: number;
}
interface Listing {
  languageCode?: string;
  title?: string;
  description?: string;
}
export interface OneTimeProduct {
  packageName?: string;
  productId: string;
  listings?: Listing[];
  purchaseOptions?: {
    purchaseOptionId: string;
    state?: 'STATE_UNSPECIFIED' | 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'INACTIVE_PUBLISHED';
    buyOption?: { legacyCompatible?: boolean; multiQuantityEnabled?: boolean };
    rentOption?: { rentalPeriod?: string };
    regionalPricingAndAvailabilityConfigs?: { regionCode: string; price?: Money; availability?: string }[];
  }[];
}
export interface Subscription {
  packageName?: string;
  productId: string;
  listings?: (Listing & { benefits?: string[] })[];
  basePlans?: {
    basePlanId: string;
    state?: 'STATE_UNSPECIFIED' | 'DRAFT' | 'ACTIVE' | 'INACTIVE';
    autoRenewingBasePlanType?: { billingPeriodDuration?: string };
    prepaidBasePlanType?: { billingPeriodDuration?: string };
    installmentsBasePlanType?: { billingPeriodDuration?: string; committedPaymentsCount?: number };
    regionalConfigs?: { regionCode: string; newSubscriberAvailability?: boolean; price?: Money }[];
  }[];
}
export interface LegacyInAppProduct {
  packageName?: string;
  sku: string;
  status?: 'statusUnspecified' | 'active' | 'inactive';
  purchaseType?: 'purchaseTypeUnspecified' | 'managedUser' | 'subscription';
  defaultLanguage?: string;
  defaultPrice?: { priceMicros?: string; currency?: string };
  prices?: Record<string, { priceMicros?: string; currency?: string }>;
  listings?: Record<string, { title?: string; description?: string }>;
}

/* ---------- Client ---------- */

export interface GooglePlayClientOptions extends HttpOptions {
  baseUrl?: string;
  now?: () => number;
}

/** Client minimal Google Play Developer API : jeton OAuth du compte de service (mis en cache) + pagination. */
export class GooglePlayClient {
  private token: GoogleAccessToken | null = null;
  private readonly sa: GoogleServiceAccountKey;
  private readonly baseUrl: string;
  private readonly now: () => number;

  constructor(serviceAccount: string | GoogleServiceAccountKey, private readonly opts: GooglePlayClientOptions = {}) {
    this.sa = parseServiceAccount(serviceAccount);
    this.baseUrl = (opts.baseUrl ?? ANDROID_PUBLISHER_BASE_URL).replace(/\/$/, '');
    this.now = opts.now ?? Date.now;
  }

  private async bearer(): Promise<string> {
    if (!this.token || this.token.expiresAt - 60_000 <= this.now()) {
      this.token = await fetchGoogleAccessToken(this.sa, { ...this.opts, now: this.now() });
    }
    return this.token.accessToken;
  }

  async get<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const u = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) u.searchParams.set(k, String(v));
    return requestJson<T>(
      'google_play',
      u.toString(),
      { headers: { Authorization: `Bearer ${await this.bearer()}`, Accept: 'application/json' } },
      this.opts,
    );
  }

  /** `monetization.onetimeproducts.list` — GET /applications/{packageName}/oneTimeProducts */
  async listOneTimeProducts(packageName: string): Promise<OneTimeProduct[]> {
    return this.paginate<OneTimeProduct>(`/applications/${encodeURIComponent(packageName)}/oneTimeProducts`, 'oneTimeProducts');
  }

  /** `monetization.subscriptions.list` — GET /applications/{packageName}/subscriptions */
  async listSubscriptions(packageName: string): Promise<Subscription[]> {
    return this.paginate<Subscription>(`/applications/${encodeURIComponent(packageName)}/subscriptions`, 'subscriptions');
  }

  /** `inappproducts.list` (ancien modèle, pagination par `token`) — GET /applications/{packageName}/inappproducts */
  async listLegacyInAppProducts(packageName: string, maxPages = 50): Promise<LegacyInAppProduct[]> {
    const out: LegacyInAppProduct[] = [];
    let token: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const res = await this.get<{ inappproduct?: LegacyInAppProduct[]; tokenPagination?: { nextPageToken?: string } }>(
        `/applications/${encodeURIComponent(packageName)}/inappproducts`,
        { token },
      );
      out.push(...(res.inappproduct ?? []));
      token = res.tokenPagination?.nextPageToken;
      if (!token) break;
    }
    return out;
  }

  private async paginate<T>(path: string, key: string, maxPages = 50): Promise<T[]> {
    const out: T[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const res = await this.get<Record<string, unknown> & { nextPageToken?: string }>(path, { pageSize: 1000, pageToken });
      out.push(...((res[key] as T[] | undefined) ?? []));
      pageToken = res.nextPageToken;
      if (!pageToken) break;
    }
    return out;
  }
}

/* ---------- Import ---------- */

export interface GooglePlayImportOptions extends GooglePlayClientOptions {
  /** Contenu (ou objet) du fichier JSON de clé du compte de service. */
  serviceAccount: string | GoogleServiceAccountKey;
  /** Nom de package Android (`com.studio.jeu`). */
  packageName: string;
  /** Région, code ISO 3166-1 alpha-2 (`FR`, `US`, `GB`…). Défaut `FR`. */
  regionCode?: string;
  /** Langue préférée pour les titres (défaut `fr-FR`). */
  languageCode?: string;
  /**
   * API des produits uniques : `monetization` (défaut, `monetization.onetimeproducts`, modèle actuel)
   * ou `inappproducts` (ancien service, toujours servi tant que Play Billing Library 7 est supportée).
   */
  oneTimeApi?: 'monetization' | 'inappproducts';
  /**
   * Google Play ne distingue pas consommable / non consommable au niveau du produit (c'est l'app qui « consomme ») :
   * type attribué aux produits uniques. Défaut `consumable`.
   */
  oneTimeProductType?: ItemType | ((productId: string) => ItemType);
  /** Inclure les produits / forfaits inactifs ou brouillons (défaut false). */
  includeInactive?: boolean;
}

/**
 * Importe le catalogue Google Play d'une app : produits uniques (`monetization.onetimeproducts`
 * ou `inappproducts`) et abonnements (`monetization.subscriptions`, un produit Dev AppStore par forfait de base).
 */
export async function importGooglePlayCatalog(opts: GooglePlayImportOptions): Promise<ImportResult> {
  const client = new GooglePlayClient(opts.serviceAccount, opts);
  const region = (opts.regionCode ?? 'FR').toUpperCase();
  const lang = opts.languageCode ?? 'fr-FR';
  const warnings: ImportWarning[] = [];
  const warn = (w: Omit<ImportWarning, 'source'>) => warnings.push({ source: 'google_play', ...w });
  const oneTimeType = (id: string): ItemType =>
    typeof opts.oneTimeProductType === 'function' ? opts.oneTimeProductType(id) : (opts.oneTimeProductType ?? 'consumable');
  const products: ImportedProduct[] = [];

  const push = (p: Omit<ImportedProduct, 'source' | 'currency' | 'priceCents'>, cents: number | null, currencyCode: string | undefined) => {
    if (cents === null || !currencyCode) {
      warn({ productId: p.productId, code: 'no_price', message: `Aucun prix pour la région ${region}.` });
      return;
    }
    const currency = toCurrency(currencyCode);
    if (!currency) {
      warn({ productId: p.productId, code: 'unsupported_currency', message: `Devise ${currencyCode} non gérée (EUR, USD, GBP).` });
      return;
    }
    const out: ImportedProduct = { source: 'google_play', ...p, priceCents: cents, currency };
    if (!out.subtitle) delete out.subtitle;
    if (out.period === undefined) delete out.period;
    products.push(out);
  };

  /* ---- Produits uniques ---- */
  if ((opts.oneTimeApi ?? 'monetization') === 'monetization') {
    for (const p of await client.listOneTimeProducts(opts.packageName)) {
      const listing = pickLocale(p.listings ?? [], (l) => l.languageCode, lang);
      const buyOptions = (p.purchaseOptions ?? []).filter((o) => o.buyOption && (opts.includeInactive || o.state === 'ACTIVE'));
      // L'option « rétrocompatible » est celle que voient les anciennes versions du jeu : c'est le prix de référence.
      const option = buyOptions.find((o) => o.buyOption?.legacyCompatible) ?? buyOptions[0];
      if (!option) {
        warn({ productId: p.productId, code: 'inactive', message: "Ignoré : aucune option d'achat active (les locations ne sont pas importées)." });
        continue;
      }
      const cfg = option.regionalPricingAndAvailabilityConfigs?.find((c) => c.regionCode.toUpperCase() === region);
      const available = cfg && (!cfg.availability || cfg.availability === 'AVAILABLE' || opts.includeInactive);
      push(
        { productId: p.productId, sourceId: option.purchaseOptionId, type: oneTimeType(p.productId), title: listing?.title || p.productId, subtitle: listing?.description },
        available ? moneyToCents(cfg.price) : null,
        cfg?.price?.currencyCode,
      );
    }
  } else {
    for (const p of await client.listLegacyInAppProducts(opts.packageName)) {
      if (p.purchaseType === 'subscription') continue; // gérés par monetization.subscriptions
      if (!opts.includeInactive && p.status && p.status !== 'active') {
        warn({ productId: p.sku, code: 'inactive', message: 'Ignoré : produit inactif sur Google Play.' });
        continue;
      }
      const entries = Object.entries(p.listings ?? {}).map(([languageCode, l]) => ({ languageCode, ...l }));
      const listing = pickLocale(entries, (l) => l.languageCode, lang);
      const price = p.prices?.[region];
      push(
        { productId: p.sku, type: oneTimeType(p.sku), title: listing?.title || p.sku, subtitle: listing?.description },
        microsToCents(price?.priceMicros),
        price?.currency,
      );
    }
  }

  /* ---- Abonnements : un produit par forfait de base ---- */
  for (const s of await client.listSubscriptions(opts.packageName)) {
    const listing = pickLocale(s.listings ?? [], (l) => l.languageCode, lang);
    for (const bp of s.basePlans ?? []) {
      const productId = `${s.productId}:${bp.basePlanId}`;
      if (!opts.includeInactive && bp.state !== 'ACTIVE') {
        warn({ productId, code: 'inactive', message: `Ignoré : forfait de base à l'état ${bp.state ?? 'inconnu'}.` });
        continue;
      }
      const type: ItemType = bp.prepaidBasePlanType ? 'non_renewing' : 'auto_renewable';
      const duration =
        bp.autoRenewingBasePlanType?.billingPeriodDuration ??
        bp.prepaidBasePlanType?.billingPeriodDuration ??
        bp.installmentsBasePlanType?.billingPeriodDuration;
      const period = isoPeriod(duration);
      if (!period) {
        warn({ productId, code: 'unsupported_period', message: `Période ${duration} non gérée par Dev AppStore (semaine, mois, an) : à ajuster.` });
      }
      if (bp.installmentsBasePlanType) {
        warn({
          productId,
          code: 'installments_plan',
          message: `Forfait à versements (${bp.installmentsBasePlanType.committedPaymentsCount ?? '?'} paiements engagés) importé comme abonnement simple.`,
        });
      }
      const cfg = bp.regionalConfigs?.find((c) => c.regionCode.toUpperCase() === region);
      const available = cfg && (cfg.newSubscriberAvailability || opts.includeInactive);
      const subtitle = listing?.description || listing?.benefits?.join(' · ');
      push(
        { productId, sourceId: bp.basePlanId, type, title: listing?.title || s.productId, subtitle, period: period ?? undefined },
        available ? moneyToCents(cfg.price) : null,
        cfg?.price?.currencyCode,
      );
    }
  }

  return { products, warnings };
}
