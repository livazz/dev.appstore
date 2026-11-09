import 'server-only';
import { generateKeyPairSync } from 'node:crypto';
import type { AppStoreImportOptions, FetchLike, GooglePlayImportOptions } from '@wolleen/importers';

/*
 * Mode démo de la page « Importer depuis les stores ».
 *
 * Plutôt que de renvoyer une liste toute faite, on simule les API d'App Store Connect et de Google Play
 * (mêmes chemins, même forme JSON:API / androidpublisher v3) et on fait passer l'import par le vrai code de
 * @wolleen/importers : signature des JWT avec des clés éphémères, échange de jeton OAuth, pagination, choix du prix
 * en vigueur, avertissements… Le studio voit exactement ce qu'il verrait avec ses vraies clés.
 *
 * Le catalogue est celui d'un jeu mobile type (gemmes, packs, pass) ; certains identifiants recoupent ceux du jeu
 * de démo « Crystal Quest » (gems_1200, gems_6500, starter_pack, pass_royal_monthly) pour montrer la détection
 * des articles déjà présents.
 */

export const DEMO_APPLE_APP_ID = '6739104512';
export const DEMO_PACKAGE_NAME = 'com.example.crystalquest';

let keys: { ec: string; rsa: string } | null = null;
function demoKeys() {
  if (!keys) {
    const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    keys = { ec, rsa };
  }
  return keys;
}

const CURRENCY_BY_TERRITORY: Record<string, string> = { FRA: 'EUR', USA: 'USD', GBR: 'GBP', FR: 'EUR', US: 'USD', GB: 'GBP' };
const ALPHA3: Record<string, string> = { FR: 'FRA', US: 'USA', GB: 'GBR' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/* ------------------------------------------------------------------ */
/* App Store Connect (JSON:API)                                        */
/* ------------------------------------------------------------------ */

const ASC = 'https://api.appstoreconnect.apple.com';

interface DemoIap {
  id: string;
  productId: string;
  type: 'CONSUMABLE' | 'NON_CONSUMABLE' | 'NON_RENEWING_SUBSCRIPTION';
  state: string;
  fr: [string, string];
  en: [string, string];
  /** Prix manuel du territoire, ou `auto:` pour un prix généré par péréquation. */
  price: string;
}

const APPLE_IAPS: DemoIap[] = [
  { id: '6740000101', productId: 'gems_100', type: 'CONSUMABLE', state: 'APPROVED', fr: ['100 gemmes', 'Une poignée de gemmes'], en: ['100 Gems', 'A handful of gems'], price: '0.99' },
  { id: '6740000102', productId: 'gems_550', type: 'CONSUMABLE', state: 'APPROVED', fr: ['550 gemmes', '+10 % offerts'], en: ['550 Gems', '+10% bonus'], price: '4.99' },
  { id: '6740000103', productId: 'gems_1200', type: 'CONSUMABLE', state: 'APPROVED', fr: ['Sac de 1 200 gemmes', 'Le plus populaire'], en: ['Bag of 1,200 Gems', 'Most popular'], price: '9.99' },
  { id: '6740000104', productId: 'gems_6500', type: 'CONSUMABLE', state: 'APPROVED', fr: ['Coffre de 6 500 gemmes', '+15 % offerts'], en: ['Chest of 6,500 Gems', '+15% bonus'], price: '49.99' },
  { id: '6740000105', productId: 'gems_14000', type: 'CONSUMABLE', state: 'APPROVED', fr: ['Trésor de 14 000 gemmes', 'Meilleure offre'], en: ['Treasure of 14,000 Gems', 'Best value'], price: '99.99' },
  { id: '6740000106', productId: 'mega_bundle', type: 'CONSUMABLE', state: 'APPROVED', fr: ['Méga pack du dragon', 'Gemmes, or et skin exclusif'], en: ['Dragon mega bundle', 'Gems, gold and exclusive skin'], price: '149.99' },
  { id: '6740000107', productId: 'starter_pack', type: 'NON_CONSUMABLE', state: 'APPROVED', fr: ['Pack débutant', 'Une seule fois par compte'], en: ['Starter pack', 'Once per account'], price: '4.99' },
  { id: '6740000108', productId: 'remove_ads', type: 'NON_CONSUMABLE', state: 'APPROVED', fr: ['Sans publicité', 'Supprime les publicités pour toujours'], en: ['No ads', 'Removes ads forever'], price: 'auto:3.99' },
  { id: '6740000109', productId: 'event_pass_halloween', type: 'NON_RENEWING_SUBSCRIPTION', state: 'DEVELOPER_REMOVED_FROM_SALE', fr: ['Pass Halloween', '30 jours de récompenses'], en: ['Halloween pass', '30 days of rewards'], price: '2.99' },
  { id: '6740000110', productId: 'season_pass_s7', type: 'NON_RENEWING_SUBSCRIPTION', state: 'APPROVED', fr: ['Pass de saison 7', 'Récompenses premium pendant 60 jours'], en: ['Season 7 pass', 'Premium rewards for 60 days'], price: '7.99' },
];

const APPLE_SUBS = [
  { id: '6741000201', productId: 'pass_royal_monthly', period: 'ONE_MONTH', level: 3, fr: ['Pass Royal mensuel', 'Récompenses x2 et coffres exclusifs'], price: '5.99' },
  { id: '6741000202', productId: 'pass_royal_quarterly', period: 'THREE_MONTHS', level: 2, fr: ['Pass Royal trimestriel', 'Récompenses x2 et coffres exclusifs'], price: '14.99' },
  { id: '6741000203', productId: 'pass_royal_yearly', period: 'ONE_YEAR', level: 1, fr: ['Pass Royal annuel', '2 mois offerts'], price: '49.99' },
];

const page = (data: unknown[], included: unknown[] = []) => ({ data, included, links: { self: 'demo' }, meta: { paging: { total: data.length, limit: 200 } } });

function applePrices(kind: 'inAppPurchasePrices' | 'subscriptionPrices', id: string, price: string, territory: string) {
  const ppType = kind === 'inAppPurchasePrices' ? 'inAppPurchasePricePoints' : 'subscriptionPricePoints';
  const ppRel = kind === 'inAppPurchasePrices' ? 'inAppPurchasePricePoint' : 'subscriptionPricePoint';
  return page(
    [
      {
        type: kind,
        id: `price-${id}`,
        attributes: kind === 'inAppPurchasePrices' ? { startDate: null, endDate: null, manual: true } : { startDate: null, preserved: false, planType: 'UPFRONT' },
        relationships: { [ppRel]: { data: { type: ppType, id: `pp-${id}` } }, territory: { data: { type: 'territories', id: territory } } },
      },
    ],
    [
      { type: 'territories', id: territory, attributes: { currency: CURRENCY_BY_TERRITORY[territory] ?? 'EUR' } },
      { type: ppType, id: `pp-${id}`, attributes: { customerPrice: price, proceeds: (Number(price) * 0.7).toFixed(2) } },
    ],
  );
}

function appleRoute(url: URL): Response {
  const territory = (url.searchParams.get('filter[territory]') ?? 'FRA').toUpperCase();
  const p = url.pathname;
  if (p === `/v1/apps/${DEMO_APPLE_APP_ID}/inAppPurchasesV2`) {
    const data = APPLE_IAPS.map((i) => ({
      type: 'inAppPurchases',
      id: i.id,
      attributes: { name: `REF ${i.productId}`, productId: i.productId, inAppPurchaseType: i.type, state: i.state },
      relationships: {
        inAppPurchaseLocalizations: { data: [{ type: 'inAppPurchaseLocalizations', id: `${i.id}-fr` }, { type: 'inAppPurchaseLocalizations', id: `${i.id}-en` }] },
        iapPriceSchedule: { data: { type: 'inAppPurchasePriceSchedules', id: i.id } },
      },
    }));
    const included = APPLE_IAPS.flatMap((i) => [
      { type: 'inAppPurchaseLocalizations', id: `${i.id}-fr`, attributes: { locale: 'fr-FR', name: i.fr[0], description: i.fr[1] } },
      { type: 'inAppPurchaseLocalizations', id: `${i.id}-en`, attributes: { locale: 'en-US', name: i.en[0], description: i.en[1] } },
    ]);
    return json(page(data, included));
  }
  let m = /^\/v1\/inAppPurchasePriceSchedules\/(\d+)\/(manualPrices|automaticPrices)$/.exec(p);
  if (m) {
    const iap = APPLE_IAPS.find((i) => i.id === m![1]);
    if (!iap) return json({ errors: [{ status: '404' }] }, 404);
    const auto = iap.price.startsWith('auto:');
    if ((m[2] === 'manualPrices') === auto) return json(page([]));
    return json(applePrices('inAppPurchasePrices', iap.id, iap.price.replace('auto:', ''), territory));
  }
  if (p === `/v1/apps/${DEMO_APPLE_APP_ID}/subscriptionGroups`) {
    return json(page([{ type: 'subscriptionGroups', id: '21900001', attributes: { referenceName: 'Pass Royal' } }]));
  }
  if (p === '/v1/subscriptionGroups/21900001/subscriptions') {
    return json(
      page(
        APPLE_SUBS.map((s) => ({
          type: 'subscriptions',
          id: s.id,
          attributes: { name: `REF ${s.productId}`, productId: s.productId, subscriptionPeriod: s.period, state: 'APPROVED', groupLevel: s.level },
          relationships: { subscriptionLocalizations: { data: [{ type: 'subscriptionLocalizations', id: `${s.id}-fr` }] } },
        })),
        APPLE_SUBS.map((s) => ({ type: 'subscriptionLocalizations', id: `${s.id}-fr`, attributes: { locale: 'fr-FR', name: s.fr[0], description: s.fr[1] } })),
      ),
    );
  }
  m = /^\/v1\/subscriptions\/(\d+)\/prices$/.exec(p);
  if (m) {
    const s = APPLE_SUBS.find((x) => x.id === m![1]);
    return s ? json(applePrices('subscriptionPrices', s.id, s.price, territory)) : json(page([]));
  }
  return json({ errors: [{ status: '404', code: 'NOT_FOUND', detail: p }] }, 404);
}

/* ------------------------------------------------------------------ */
/* Google Play Developer API (androidpublisher v3)                     */
/* ------------------------------------------------------------------ */

const money = (currencyCode: string, price: string) => {
  const [u, f = '0'] = price.split('.');
  return { currencyCode, units: u, nanos: Number(f.padEnd(9, '0').slice(0, 9)) };
};

const GOOGLE_ONE_TIME = [
  // Mêmes identifiants que sur l'App Store : dédoublonnés à l'import (la fiche App Store est conservée).
  { productId: 'gems_100', title: '100 gemmes', description: 'Une poignée de gemmes', price: '0.99' },
  { productId: 'gems_1200', title: '1 200 gemmes', description: 'Le plus populaire', price: '9.99' },
  // Exclusivités Android.
  { productId: 'gold_10000', title: "Pile de 10 000 pièces d'or", description: 'Pour améliorer vos bâtiments', price: '3.99' },
  { productId: 'energy_refill', title: "Recharge d'énergie", description: 'Énergie au maximum', price: '0.49' },
  { productId: 'gems_japan_only', title: 'ジェム', description: '日本限定', price: '', region: 'JP' },
];

const GOOGLE_SUBS = [
  {
    productId: 'vip',
    title: 'Club VIP',
    benefits: ['Récompenses quotidiennes', 'Sans publicité'],
    plans: [
      { basePlanId: 'monthly', duration: 'P1M', price: '4.99', state: 'ACTIVE' },
      { basePlanId: 'weekly', duration: 'P1W', price: '1.99', state: 'ACTIVE' },
      { basePlanId: 'test-annuel', duration: 'P1Y', price: '39.99', state: 'DRAFT' },
    ],
  },
];

function googleRoute(url: URL, regionCode: string): Response {
  const region = regionCode.toUpperCase();
  const currency = CURRENCY_BY_TERRITORY[region] ?? 'EUR';
  const base = `/androidpublisher/v3/applications/${DEMO_PACKAGE_NAME}`;
  if (url.pathname === `${base}/oneTimeProducts`) {
    return json({
      oneTimeProducts: GOOGLE_ONE_TIME.map((p) => ({
        packageName: DEMO_PACKAGE_NAME,
        productId: p.productId,
        listings: [{ languageCode: p.region === 'JP' ? 'ja-JP' : 'fr-FR', title: p.title, description: p.description }],
        purchaseOptions: [
          {
            purchaseOptionId: 'buy',
            state: 'ACTIVE',
            buyOption: { legacyCompatible: true, multiQuantityEnabled: true },
            regionalPricingAndAvailabilityConfigs: p.region
              ? [{ regionCode: p.region, price: money('JPY', '160'), availability: 'AVAILABLE' }]
              : [{ regionCode: region, price: money(currency, p.price), availability: 'AVAILABLE' }],
          },
        ],
      })),
    });
  }
  if (url.pathname === `${base}/subscriptions`) {
    return json({
      subscriptions: GOOGLE_SUBS.map((s) => ({
        packageName: DEMO_PACKAGE_NAME,
        productId: s.productId,
        listings: [{ languageCode: 'fr-FR', title: s.title, benefits: s.benefits, description: '' }],
        basePlans: s.plans.map((b) => ({
          basePlanId: b.basePlanId,
          state: b.state,
          autoRenewingBasePlanType: { billingPeriodDuration: b.duration, legacyCompatible: b.basePlanId === 'monthly' },
          regionalConfigs: [{ regionCode: region, newSubscriberAvailability: true, price: money(currency, b.price) }],
        })),
      })),
    });
  }
  return json({ error: { code: 404, message: `Not found: ${url.pathname}`, status: 'NOT_FOUND' } }, 404);
}

/* ------------------------------------------------------------------ */
/* Point d'entrée                                                      */
/* ------------------------------------------------------------------ */

/** `fetch` simulé : répond comme App Store Connect, l'OAuth Google et l'API Google Play, sans réseau. */
export function createDemoFetch(regionCode: string): FetchLike {
  return async (input: string) => {
    const url = new URL(input);
    // Latence réaliste, sans ralentir les tests.
    if (process.env.VITEST !== 'true') await new Promise((r) => setTimeout(r, 15));
    if (url.origin === ASC) return appleRoute(url);
    if (url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/token') {
      return json({ access_token: 'ya29.demo-wolleen', expires_in: 3599, token_type: 'Bearer' });
    }
    if (url.origin === 'https://androidpublisher.googleapis.com') return googleRoute(url, regionCode);
    return json({ error: 'demo: hôte inconnu' }, 404);
  };
}

/** Options d'import des deux stores branchées sur le `fetch` simulé, avec des clés éphémères. */
export function demoImportOptions(regionCode: string): { appStore: AppStoreImportOptions; googlePlay: GooglePlayImportOptions } {
  const fetch = createDemoFetch(regionCode);
  const k = demoKeys();
  return {
    appStore: {
      credentials: { issuerId: '00000000-demo-4000-8000-000000000000', keyId: 'DEMO000000', privateKey: k.ec },
      appId: DEMO_APPLE_APP_ID,
      territory: ALPHA3[regionCode.toUpperCase()] ?? 'FRA',
      fetch,
    },
    googlePlay: {
      serviceAccount: {
        type: 'service_account',
        client_email: 'wolleen-import@demo-project.iam.gserviceaccount.com',
        private_key: k.rsa,
        token_uri: 'https://oauth2.googleapis.com/token',
      },
      packageName: DEMO_PACKAGE_NAME,
      regionCode: regionCode.toUpperCase(),
      fetch,
      oneTimeProductType: (id) => (id === 'remove_ads' ? 'non_consumable' : 'consumable'),
    },
  };
}
