/**
 * @devappstore/importers — import du catalogue d'achats in-app existant d'un studio
 * depuis App Store Connect et Google Play, normalisé en `ImportedProduct` (centimes, types Dev AppStore).
 */
export * from './types';
export { suggestWebPrice, DEFAULT_WEB_DISCOUNT_BPS, SUPPORTED_CURRENCIES, toCurrency, decimalToCents, moneyToCents, microsToCents } from './pricing';
export { applePeriod, isoPeriod } from './periods';
export { signJwt, decodeJwt, normalizePem } from './jwt';
export { StoreApiError, StoreTransportError, type HttpOptions } from './http';

export {
  AppStoreConnectClient,
  createAppStoreConnectToken,
  APP_STORE_CONNECT_BASE_URL,
  type AppStoreConnectCredentials,
  type AppStoreConnectClientOptions,
} from './apple/client';
export { importAppStoreCatalog, pickCurrentPrice, type AppStoreImportOptions } from './apple/importer';

export {
  createServiceAccountAssertion,
  fetchGoogleAccessToken,
  parseServiceAccount,
  InvalidTokenUriError,
  ANDROID_PUBLISHER_SCOPE,
  GOOGLE_TOKEN_URI,
  type GoogleServiceAccountKey,
  type GoogleAccessToken,
} from './google/auth';
export {
  GooglePlayClient,
  importGooglePlayCatalog,
  ANDROID_PUBLISHER_BASE_URL,
  type GooglePlayImportOptions,
  type GooglePlayClientOptions,
  type OneTimeProduct,
  type Subscription,
  type LegacyInAppProduct,
} from './google/importer';

import type { ImportResult } from './types';
import { importAppStoreCatalog, type AppStoreImportOptions } from './apple/importer';
import { importGooglePlayCatalog, type GooglePlayImportOptions } from './google/importer';

/**
 * Importe les deux stores si configurés et fusionne. En cas de doublon de `productId`
 * (même produit sur iOS et Android), la première source (App Store) est conservée.
 * Une source en échec n'empêche pas l'autre : l'erreur devient un avertissement `fetch_failed`.
 */
export async function importCatalog(opts: { appStore?: AppStoreImportOptions; googlePlay?: GooglePlayImportOptions }): Promise<ImportResult> {
  const jobs: [ImportResult['warnings'][number]['source'], Promise<ImportResult>][] = [];
  if (opts.appStore) jobs.push(['app_store', importAppStoreCatalog(opts.appStore)]);
  if (opts.googlePlay) jobs.push(['google_play', importGooglePlayCatalog(opts.googlePlay)]);
  const out: ImportResult = { products: [], warnings: [] };
  const seen = new Set<string>();
  const settled = await Promise.allSettled(jobs.map(([, job]) => job));
  settled.forEach((r, i) => {
    const source = jobs[i]![0];
    if (r.status === 'rejected') {
      out.warnings.push({ source, code: 'fetch_failed', message: (r.reason as Error)?.message ?? String(r.reason) });
      return;
    }
    out.warnings.push(...r.value.warnings);
    for (const p of r.value.products) {
      if (seen.has(p.productId)) continue;
      seen.add(p.productId);
      out.products.push(p);
    }
  });
  return out;
}
