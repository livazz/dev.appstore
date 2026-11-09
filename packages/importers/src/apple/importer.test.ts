import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeJwt } from '../jwt';
import { fakeFetch, json } from '../test-utils';
import { StoreApiError } from '../http';
import { importAppStoreCatalog, pickCurrentPrice } from './importer';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const credentials = {
  issuerId: '57246542-96fe-1a63-e053-0824d011072a',
  keyId: '2X9R4HXF34',
  privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};
const APP = '1561234567';
const BASE = 'https://api.appstoreconnect.apple.com';

/* ---------- Réponses simulées (forme JSON:API d'App Store Connect) ---------- */

const iap = (id: string, productId: string, type: string, state: string, locIds: string[]) => ({
  type: 'inAppPurchases',
  id,
  attributes: { name: `Ref ${productId}`, productId, inAppPurchaseType: type, state, reviewNote: null, familySharable: false, contentHosting: false },
  relationships: {
    inAppPurchaseLocalizations: { data: locIds.map((l) => ({ type: 'inAppPurchaseLocalizations', id: l })) },
    iapPriceSchedule: { data: { type: 'inAppPurchasePriceSchedules', id } },
  },
  links: { self: `${BASE}/v2/inAppPurchases/${id}` },
});
const loc = (type: string, id: string, locale: string, name: string, description: string) => ({
  type,
  id,
  attributes: { name, locale, description, state: 'APPROVED' },
});

const iapPage1 = {
  data: [
    iap('6450000001', 'com.nova.crystal.gems_100', 'CONSUMABLE', 'APPROVED', ['l1', 'l2']),
    iap('6450000002', 'com.nova.crystal.remove_ads', 'NON_CONSUMABLE', 'APPROVED', ['l3']),
  ],
  included: [
    loc('inAppPurchaseLocalizations', 'l1', 'en-US', '100 Gems', 'A small bag of gems'),
    loc('inAppPurchaseLocalizations', 'l2', 'fr-FR', '100 gemmes', 'Un petit sac de gemmes'),
    loc('inAppPurchaseLocalizations', 'l3', 'en-US', 'Remove ads', 'No more ads, forever'),
  ],
  links: { self: `${BASE}/v1/apps/${APP}/inAppPurchasesV2`, next: `${BASE}/v1/apps/${APP}/inAppPurchasesV2?cursor=Mg.ANy4Uvc&limit=200` },
  meta: { paging: { total: 4, limit: 200 } },
};
const iapPage2 = {
  data: [
    iap('6450000003', 'com.nova.crystal.season_pass', 'NON_RENEWING_SUBSCRIPTION', 'DEVELOPER_REMOVED_FROM_SALE', []),
    iap('6450000004', 'com.nova.crystal.gems_1200', 'CONSUMABLE', 'READY_TO_SUBMIT', ['l4']),
  ],
  included: [loc('inAppPurchaseLocalizations', 'l4', 'fr-CA', '1 200 gemmes', 'Le coffre du dragon')],
  links: { self: `${BASE}/v1/apps/${APP}/inAppPurchasesV2?cursor=Mg.ANy4Uvc&limit=200` },
  meta: { paging: { total: 4, limit: 200 } },
};

/** Réponse `manualPrices` / `automaticPrices` avec points de prix et territoire inclus. */
const prices = (kind: 'inAppPurchasePrices' | 'subscriptionPrices', rows: { id: string; price: string; start: string | null; end?: string | null; planType?: string }[], currency = 'EUR', territory = 'FRA') => {
  const ppType = kind === 'inAppPurchasePrices' ? 'inAppPurchasePricePoints' : 'subscriptionPricePoints';
  const ppRel = kind === 'inAppPurchasePrices' ? 'inAppPurchasePricePoint' : 'subscriptionPricePoint';
  return {
    data: rows.map((r) => ({
      type: kind,
      id: `price-${r.id}`,
      attributes:
        kind === 'inAppPurchasePrices'
          ? { startDate: r.start, endDate: r.end ?? null, manual: true }
          : { startDate: r.start, preserved: false, planType: r.planType ?? 'UPFRONT' },
      relationships: { [ppRel]: { data: { type: ppType, id: `pp-${r.id}` } }, territory: { data: { type: 'territories', id: territory } } },
    })),
    included: [
      { type: 'territories', id: territory, attributes: { currency } },
      ...rows.map((r) => ({ type: ppType, id: `pp-${r.id}`, attributes: { customerPrice: r.price, proceeds: '0.70' } })),
    ],
    links: { self: 'x' },
    meta: { paging: { total: rows.length, limit: 200 } },
  };
};
const empty = { data: [], links: { self: 'x' }, meta: { paging: { total: 0, limit: 200 } } };

const sub = (id: string, productId: string, period: string, groupLevel: number, locIds: string[], state = 'APPROVED') => ({
  type: 'subscriptions',
  id,
  attributes: { name: `Ref ${productId}`, productId, familySharable: false, state, subscriptionPeriod: period, reviewNote: null, groupLevel },
  relationships: { subscriptionLocalizations: { data: locIds.map((l) => ({ type: 'subscriptionLocalizations', id: l })) } },
});

function appleRoutes(overrides: Record<string, Parameters<typeof fakeFetch>[0][string]> = {}) {
  return fakeFetch({
    [`/v1/apps/${APP}/inAppPurchasesV2`]: (u) => (u.searchParams.get('cursor') ? iapPage2 : iapPage1),
    // gems_100 : prix manuel en France
    '/v1/inAppPurchasePriceSchedules/6450000001/manualPrices': () => prices('inAppPurchasePrices', [{ id: 'a', price: '0.99', start: null }]),
    // remove_ads : territoire de base USA, prix France généré automatiquement
    '/v1/inAppPurchasePriceSchedules/6450000002/manualPrices': () => empty,
    '/v1/inAppPurchasePriceSchedules/6450000002/automaticPrices': () => prices('inAppPurchasePrices', [{ id: 'b', price: '3.99', start: null }]),
    // gems_1200 : hausse de prix programmée au 1er décembre
    '/v1/inAppPurchasePriceSchedules/6450000004/manualPrices': () =>
      prices('inAppPurchasePrices', [
        { id: 'c1', price: '9.99', start: null, end: '2026-12-01' },
        { id: 'c2', price: '10.99', start: '2026-12-01', end: null },
      ]),
    [`/v1/apps/${APP}/subscriptionGroups`]: () => ({
      data: [{ type: 'subscriptionGroups', id: '21000001', attributes: { referenceName: 'Nova Pass' } }],
      links: { self: 'x' },
    }),
    '/v1/subscriptionGroups/21000001/subscriptions': () => ({
      data: [
        sub('6460000001', 'com.nova.crystal.vip_monthly', 'ONE_MONTH', 2, ['s1', 's2']),
        sub('6460000002', 'com.nova.crystal.vip_quarterly', 'THREE_MONTHS', 3, ['s3']),
        sub('6460000003', 'com.nova.crystal.vip_yearly', 'ONE_YEAR', 1, ['s4']),
      ],
      included: [
        loc('subscriptionLocalizations', 's1', 'en-US', 'VIP monthly', 'Double rewards'),
        loc('subscriptionLocalizations', 's2', 'fr-FR', 'VIP mensuel', 'Récompenses doublées'),
        loc('subscriptionLocalizations', 's3', 'fr-FR', 'VIP trimestriel', 'Récompenses doublées'),
        loc('subscriptionLocalizations', 's4', 'fr-FR', 'VIP annuel', 'Récompenses doublées'),
      ],
      links: { self: 'x' },
    }),
    // vip_monthly : prix initial puis changement au 1er octobre 2026 (déjà en vigueur) + offre mensuelle engagée ignorée
    '/v1/subscriptions/6460000001/prices': () =>
      prices('subscriptionPrices', [
        { id: 'm1', price: '3.99', start: null },
        { id: 'm2', price: '4.99', start: '2026-10-01' },
        { id: 'm3', price: '1.99', start: '2026-10-01', planType: 'MONTHLY' },
      ]),
    '/v1/subscriptions/6460000002/prices': () => prices('subscriptionPrices', [{ id: 'q', price: '12.99', start: null }]),
    // vip_yearly : pas disponible en France
    '/v1/subscriptions/6460000003/prices': () => empty,
    ...overrides,
  });
}

describe('importAppStoreCatalog', () => {
  it('importe achats intégrés et abonnements avec noms localisés et prix en vigueur', async () => {
    const fetch = appleRoutes();
    const result = await importAppStoreCatalog({ credentials, appId: APP, fetch, date: new Date('2026-11-09T10:00:00Z') });

    expect(result.products).toEqual([
      {
        source: 'app_store',
        productId: 'com.nova.crystal.gems_100',
        sourceId: '6450000001',
        type: 'consumable',
        title: '100 gemmes',
        subtitle: 'Un petit sac de gemmes',
        priceCents: 99,
        currency: 'EUR',
      },
      {
        source: 'app_store',
        productId: 'com.nova.crystal.remove_ads',
        sourceId: '6450000002',
        type: 'non_consumable',
        title: 'Remove ads',
        subtitle: 'No more ads, forever',
        priceCents: 399,
        currency: 'EUR',
      },
      {
        source: 'app_store',
        productId: 'com.nova.crystal.gems_1200',
        sourceId: '6450000004',
        type: 'consumable',
        title: '1 200 gemmes',
        subtitle: 'Le coffre du dragon',
        priceCents: 999,
        currency: 'EUR',
      },
      {
        source: 'app_store',
        productId: 'com.nova.crystal.vip_monthly',
        sourceId: '6460000001',
        type: 'auto_renewable',
        title: 'VIP mensuel',
        subtitle: 'Récompenses doublées',
        priceCents: 499,
        currency: 'EUR',
        period: 'month',
      },
      {
        source: 'app_store',
        productId: 'com.nova.crystal.vip_quarterly',
        sourceId: '6460000002',
        type: 'auto_renewable',
        title: 'VIP trimestriel',
        subtitle: 'Récompenses doublées',
        priceCents: 1299,
        currency: 'EUR',
      },
    ]);
    expect(result.warnings.map((w) => [w.productId, w.code])).toEqual([
      ['com.nova.crystal.season_pass', 'inactive'],
      ['com.nova.crystal.vip_quarterly', 'unsupported_period'],
      ['com.nova.crystal.vip_yearly', 'no_price'],
    ]);
  });

  it('authentifie chaque requête avec un JWT ES256 et filtre par territoire', async () => {
    const fetch = appleRoutes();
    await importAppStoreCatalog({ credentials, appId: APP, fetch, date: new Date('2026-11-09') });

    const first = fetch.calls[0]!;
    expect(first.url.origin + first.url.pathname).toBe(`${BASE}/v1/apps/${APP}/inAppPurchasesV2`);
    expect(first.url.searchParams.get('include')).toBe('inAppPurchaseLocalizations,iapPriceSchedule');
    expect(first.url.searchParams.get('limit')).toBe('200');

    const auth = new Headers(first.init?.headers).get('authorization')!;
    expect(auth).toMatch(/^Bearer /);
    const { header, payload } = decodeJwt(auth.slice(7));
    expect(header).toMatchObject({ alg: 'ES256', kid: '2X9R4HXF34' });
    expect(payload).toMatchObject({ iss: credentials.issuerId, aud: 'appstoreconnect-v1' });

    const priceCalls = fetch.calls.filter((c) => /Prices$|\/prices$/.test(c.url.pathname));
    expect(priceCalls.length).toBeGreaterThan(0);
    for (const c of priceCalls) expect(c.url.searchParams.get('filter[territory]')).toBe('FRA');
    // Pagination : la page suivante est demandée via links.next
    expect(fetch.calls.some((c) => c.url.searchParams.get('cursor') === 'Mg.ANy4Uvc')).toBe(true);
  });

  it('prend le nouveau prix après la date de changement programmée', async () => {
    const result = await importAppStoreCatalog({ credentials, appId: APP, fetch: appleRoutes(), date: new Date('2026-12-15') });
    expect(result.products.find((p) => p.productId === 'com.nova.crystal.gems_1200')?.priceCents).toBe(1099);
  });

  it('signale les devises non gérées (ex. Japon)', async () => {
    const jpy = () => prices('inAppPurchasePrices', [{ id: 'j', price: '160', start: null }], 'JPY', 'JPN');
    const fetch = appleRoutes({
      '/v1/inAppPurchasePriceSchedules/6450000001/manualPrices': jpy,
      '/v1/inAppPurchasePriceSchedules/6450000002/manualPrices': jpy,
      '/v1/inAppPurchasePriceSchedules/6450000004/manualPrices': jpy,
      '/v1/subscriptions/6460000001/prices': () => empty,
      '/v1/subscriptions/6460000002/prices': () => empty,
    });
    const result = await importAppStoreCatalog({ credentials, appId: APP, territory: 'jpn', fetch });
    expect(result.products).toEqual([]);
    expect(result.warnings.filter((w) => w.code === 'unsupported_currency')).toHaveLength(3);
  });

  it('relance après un 429 puis réussit', async () => {
    let n = 0;
    const sleeps: number[] = [];
    const fetch = appleRoutes({
      [`/v1/apps/${APP}/inAppPurchasesV2`]: (u) =>
        n++ === 0
          ? json({ errors: [{ status: '429', code: 'RATE_LIMIT_EXCEEDED' }] }, 429, { 'retry-after': '2' })
          : u.searchParams.get('cursor')
            ? iapPage2
            : iapPage1,
    });
    const result = await importAppStoreCatalog({ credentials, appId: APP, fetch, sleep: async (ms) => void sleeps.push(ms), date: new Date('2026-11-09') });
    expect(sleeps).toEqual([2000]);
    expect(result.products).toHaveLength(5);
  });

  it('remonte une StoreApiError explicite si la clé est refusée', async () => {
    const fetch = appleRoutes({
      [`/v1/apps/${APP}/inAppPurchasesV2`]: () =>
        json({ errors: [{ status: '401', code: 'NOT_AUTHORIZED', title: 'Authentication credentials are missing or invalid.' }] }, 401),
    });
    await expect(importAppStoreCatalog({ credentials, appId: APP, fetch })).rejects.toBeInstanceOf(StoreApiError);
  });
});

describe('pickCurrentPrice', () => {
  const p = (start: string | null, end: string | null) => ({ type: 'x', id: `${start}-${end}`, attributes: { startDate: start, endDate: end } });
  it('choisit le prix actif le plus récent', () => {
    const list = [p(null, '2026-01-01'), p('2026-01-01', null), p('2027-01-01', null)];
    expect(pickCurrentPrice(list, '2025-06-01')?.id).toBe('null-2026-01-01');
    expect(pickCurrentPrice(list, '2026-06-01')?.id).toBe('2026-01-01-null');
    expect(pickCurrentPrice(list, '2027-02-01')?.id).toBe('2027-01-01-null');
  });
});
