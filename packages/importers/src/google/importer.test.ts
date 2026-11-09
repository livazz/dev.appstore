import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fakeFetch, json } from '../test-utils';
import { importGooglePlayCatalog } from './importer';
import { importCatalog } from '../index';

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
/** Forme du fichier JSON téléchargé depuis Google Cloud (IAM → Comptes de service → Clés). */
const serviceAccount = JSON.stringify({
  type: 'service_account',
  project_id: 'nova-games-play',
  private_key_id: '8f3c2b1a0d9e8f7c6b5a4d3c2b1a0f9e8d7c6b5a',
  private_key: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  client_email: 'wolleen-import@nova-games-play.iam.gserviceaccount.com',
  client_id: '109876543210987654321',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
});
const PKG = 'com.novagames.crystal';
const API = `/androidpublisher/v3/applications/${PKG}`;

const money = (currencyCode: string, units: string, nanos = 0) => ({ currencyCode, units, nanos });

/* ---------- Réponses simulées (monetization.onetimeproducts / monetization.subscriptions) ---------- */

const oneTimePage1 = {
  oneTimeProducts: [
    {
      packageName: PKG,
      productId: 'gems_100',
      listings: [
        { languageCode: 'en-US', title: '100 Gems', description: 'A small bag of gems' },
        { languageCode: 'fr-FR', title: '100 gemmes', description: 'Un petit sac de gemmes' },
      ],
      purchaseOptions: [
        {
          purchaseOptionId: 'pack-x3',
          state: 'ACTIVE',
          buyOption: { legacyCompatible: false, multiQuantityEnabled: true },
          regionalPricingAndAvailabilityConfigs: [{ regionCode: 'FR', price: money('EUR', '4', 990_000_000), availability: 'AVAILABLE' }],
        },
        {
          purchaseOptionId: 'legacy-base',
          state: 'ACTIVE',
          buyOption: { legacyCompatible: true, multiQuantityEnabled: true },
          regionalPricingAndAvailabilityConfigs: [
            { regionCode: 'FR', price: money('EUR', '1', 990_000_000), availability: 'AVAILABLE' },
            { regionCode: 'US', price: money('USD', '1', 990_000_000), availability: 'AVAILABLE' },
          ],
        },
      ],
      taxAndComplianceSettings: { isTokenizedDigitalAsset: false },
      regionsVersion: { version: '2025/03' },
    },
    {
      packageName: PKG,
      productId: 'remove_ads',
      listings: [{ languageCode: 'fr-FR', title: 'Sans publicité', description: 'Supprime les publicités' }],
      purchaseOptions: [
        {
          purchaseOptionId: 'buy',
          state: 'ACTIVE',
          buyOption: { legacyCompatible: true },
          regionalPricingAndAvailabilityConfigs: [{ regionCode: 'FR', price: money('EUR', '3', 490_000_000), availability: 'AVAILABLE' }],
        },
        {
          purchaseOptionId: 'rent-7d',
          state: 'ACTIVE',
          rentOption: { rentalPeriod: 'P7D' },
          regionalPricingAndAvailabilityConfigs: [{ regionCode: 'FR', price: money('EUR', '0', 990_000_000), availability: 'AVAILABLE' }],
        },
      ],
    },
  ],
  nextPageToken: 'CgtyZW1vdmVfYWRz',
};
const oneTimePage2 = {
  oneTimeProducts: [
    {
      packageName: PKG,
      productId: 'starter_pack',
      listings: [{ languageCode: 'fr-FR', title: 'Pack de démarrage', description: '…' }],
      purchaseOptions: [
        {
          purchaseOptionId: 'buy',
          state: 'INACTIVE',
          buyOption: { legacyCompatible: true },
          regionalPricingAndAvailabilityConfigs: [{ regionCode: 'FR', price: money('EUR', '0', 990_000_000), availability: 'AVAILABLE' }],
        },
      ],
    },
    {
      packageName: PKG,
      productId: 'gems_japan',
      listings: [{ languageCode: 'ja-JP', title: 'ジェム', description: '…' }],
      purchaseOptions: [
        {
          purchaseOptionId: 'buy',
          state: 'ACTIVE',
          buyOption: { legacyCompatible: true },
          regionalPricingAndAvailabilityConfigs: [{ regionCode: 'JP', price: money('JPY', '160'), availability: 'AVAILABLE' }],
        },
      ],
    },
  ],
};

const subscriptions = {
  subscriptions: [
    {
      packageName: PKG,
      productId: 'vip',
      listings: [
        { languageCode: 'fr-FR', title: 'VIP', benefits: ['Récompenses doublées', 'Sans publicité'], description: '' },
        { languageCode: 'en-US', title: 'VIP', benefits: ['Double rewards'], description: 'VIP membership' },
      ],
      basePlans: [
        {
          basePlanId: 'monthly',
          state: 'ACTIVE',
          autoRenewingBasePlanType: { billingPeriodDuration: 'P1M', gracePeriodDuration: 'P3D', resubscribeState: 'RESUBSCRIBE_STATE_ACTIVE', legacyCompatible: true },
          regionalConfigs: [
            { regionCode: 'FR', newSubscriberAvailability: true, price: money('EUR', '4', 990_000_000) },
            { regionCode: 'US', newSubscriberAvailability: true, price: money('USD', '4', 990_000_000) },
          ],
          otherRegionsConfig: { usdPrice: money('USD', '4', 990_000_000), eurPrice: money('EUR', '4', 990_000_000), newSubscriberAvailability: true },
        },
        {
          basePlanId: 'yearly',
          state: 'ACTIVE',
          autoRenewingBasePlanType: { billingPeriodDuration: 'P1Y' },
          regionalConfigs: [{ regionCode: 'FR', newSubscriberAvailability: true, price: money('EUR', '39', 990_000_000) }],
        },
        {
          basePlanId: 'quarter-prepaid',
          state: 'ACTIVE',
          prepaidBasePlanType: { billingPeriodDuration: 'P3M', timeExtension: 'TIME_EXTENSION_ACTIVE' },
          regionalConfigs: [{ regionCode: 'FR', newSubscriberAvailability: true, price: money('EUR', '12', 990_000_000) }],
        },
        {
          basePlanId: 'weekly-test',
          state: 'DRAFT',
          autoRenewingBasePlanType: { billingPeriodDuration: 'P1W' },
          regionalConfigs: [{ regionCode: 'FR', newSubscriberAvailability: true, price: money('EUR', '1', 490_000_000) }],
        },
      ],
    },
  ],
};

function googleRoutes(overrides: Parameters<typeof fakeFetch>[0] = {}) {
  let tokens = 0;
  const fetch = fakeFetch({
    'POST /token': async (_u, init) => {
      tokens++;
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
      const [h, p, s] = body.get('assertion')!.split('.');
      expect(verify('sha256', Buffer.from(`${h}.${p}`), rsa.publicKey, Buffer.from(s!, 'base64url'))).toBe(true);
      return { access_token: 'ya29.c.fake-token', expires_in: 3599, token_type: 'Bearer' };
    },
    [`${API}/oneTimeProducts`]: (u) => (u.searchParams.get('pageToken') === 'CgtyZW1vdmVfYWRz' ? oneTimePage2 : oneTimePage1),
    [`${API}/subscriptions`]: () => subscriptions,
    ...overrides,
  });
  return Object.assign(fetch, { tokenCount: () => tokens });
}

describe('importGooglePlayCatalog', () => {
  it('importe produits uniques et forfaits de base avec prix régionaux', async () => {
    const fetch = googleRoutes();
    const result = await importGooglePlayCatalog({
      serviceAccount,
      packageName: PKG,
      fetch,
      oneTimeProductType: (id) => (id === 'remove_ads' ? 'non_consumable' : 'consumable'),
    });

    expect(result.products).toEqual([
      {
        source: 'google_play',
        productId: 'gems_100',
        sourceId: 'legacy-base',
        type: 'consumable',
        title: '100 gemmes',
        subtitle: 'Un petit sac de gemmes',
        priceCents: 199,
        currency: 'EUR',
      },
      {
        source: 'google_play',
        productId: 'remove_ads',
        sourceId: 'buy',
        type: 'non_consumable',
        title: 'Sans publicité',
        subtitle: 'Supprime les publicités',
        priceCents: 349,
        currency: 'EUR',
      },
      {
        source: 'google_play',
        productId: 'vip:monthly',
        sourceId: 'monthly',
        type: 'auto_renewable',
        title: 'VIP',
        subtitle: 'Récompenses doublées · Sans publicité',
        priceCents: 499,
        currency: 'EUR',
        period: 'month',
      },
      {
        source: 'google_play',
        productId: 'vip:yearly',
        sourceId: 'yearly',
        type: 'auto_renewable',
        title: 'VIP',
        subtitle: 'Récompenses doublées · Sans publicité',
        priceCents: 3999,
        currency: 'EUR',
        period: 'year',
      },
      {
        source: 'google_play',
        productId: 'vip:quarter-prepaid',
        sourceId: 'quarter-prepaid',
        type: 'non_renewing',
        title: 'VIP',
        subtitle: 'Récompenses doublées · Sans publicité',
        priceCents: 1299,
        currency: 'EUR',
      },
    ]);
    expect(result.warnings.map((w) => [w.productId, w.code])).toEqual([
      ['starter_pack', 'inactive'],
      ['gems_japan', 'no_price'],
      ['vip:quarter-prepaid', 'unsupported_period'],
      ['vip:weekly-test', 'inactive'],
    ]);
  });

  it("n'échange l'assertion qu'une fois et envoie le jeton Bearer sur chaque appel", async () => {
    const fetch = googleRoutes();
    await importGooglePlayCatalog({ serviceAccount, packageName: PKG, fetch });
    expect(fetch.tokenCount()).toBe(1);
    const apiCalls = fetch.calls.filter((c) => c.url.hostname === 'androidpublisher.googleapis.com');
    expect(apiCalls).toHaveLength(3); // 2 pages de produits + abonnements
    for (const c of apiCalls) expect(new Headers(c.init?.headers).get('authorization')).toBe('Bearer ya29.c.fake-token');
  });

  it('prix pour une autre région (US, USD)', async () => {
    const result = await importGooglePlayCatalog({ serviceAccount, packageName: PKG, regionCode: 'us', languageCode: 'en-US', fetch: googleRoutes() });
    expect(result.products.map((p) => [p.productId, p.title, p.priceCents, p.currency])).toEqual([
      ['gems_100', '100 Gems', 199, 'USD'],
      ['vip:monthly', 'VIP', 499, 'USD'],
    ]);
  });

  it('ancien service inappproducts (option oneTimeApi)', async () => {
    const fetch = googleRoutes({
      [`${API}/inappproducts`]: (u) =>
        u.searchParams.get('token')
          ? {
              kind: 'androidpublisher#inappproductsListResponse',
              inappproduct: [
                { packageName: PKG, sku: 'old_sub', status: 'active', purchaseType: 'subscription', defaultLanguage: 'en-US' },
                { packageName: PKG, sku: 'gems_old', status: 'inactive', purchaseType: 'managedUser', defaultLanguage: 'en-US' },
              ],
            }
          : {
              kind: 'androidpublisher#inappproductsListResponse',
              inappproduct: [
                {
                  packageName: PKG,
                  sku: 'gems_500',
                  status: 'active',
                  purchaseType: 'managedUser',
                  defaultLanguage: 'en-US',
                  defaultPrice: { priceMicros: '4990000', currency: 'EUR' },
                  prices: { FR: { priceMicros: '4990000', currency: 'EUR' }, US: { priceMicros: '4990000', currency: 'USD' } },
                  listings: { 'en-US': { title: '500 Gems', description: 'A chest' }, 'fr-FR': { title: '500 gemmes', description: 'Un coffre' } },
                },
              ],
              tokenPagination: { nextPageToken: 'page2' },
            },
    });
    const result = await importGooglePlayCatalog({ serviceAccount, packageName: PKG, fetch, oneTimeApi: 'inappproducts' });
    expect(result.products[0]).toEqual({
      source: 'google_play',
      productId: 'gems_500',
      type: 'consumable',
      title: '500 gemmes',
      subtitle: 'Un coffre',
      priceCents: 499,
      currency: 'EUR',
    });
    expect(result.products.map((p) => p.productId)).not.toContain('old_sub');
    expect(result.warnings.map((w) => [w.productId, w.code])).toContainEqual(['gems_old', 'inactive']);
  });

  it('rejette un fichier de compte de service incomplet', async () => {
    await expect(importGooglePlayCatalog({ serviceAccount: '{"type":"service_account"}', packageName: PKG, fetch: googleRoutes() })).rejects.toThrow(
      /client_email/,
    );
  });
});

describe('importCatalog', () => {
  it("fusionne les sources et transforme l'échec d'une source en avertissement", async () => {
    const fetch = googleRoutes({
      '/v1/apps/123/inAppPurchasesV2': () => json({ errors: [{ status: '401', code: 'NOT_AUTHORIZED' }] }, 401),
    });
    const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const result = await importCatalog({
      appStore: { credentials: { issuerId: 'i', keyId: 'k', privateKey: ec.privateKey }, appId: '123', fetch },
      googlePlay: { serviceAccount, packageName: PKG, fetch },
    });
    expect(result.products.map((p) => p.productId)).toEqual(['gems_100', 'remove_ads', 'vip:monthly', 'vip:yearly', 'vip:quarter-prepaid']);
    expect(result.warnings[0]).toMatchObject({ source: 'app_store', code: 'fetch_failed' });
    expect(result.warnings[0]!.message).toContain('HTTP 401');
  });
});
