import { generateKeyPairSync } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_ITEM_STYLE } from '@wolleen/core';
import { createTestDb } from '@wolleen/db/testing';
import { eq, importRuns, items, storeCredentials, studioMembers, studios, user, type DB } from '@wolleen/db';
import type { FetchLike } from '@wolleen/importers';
import { createGameFor, createItemFor, deleteItemFor, StudioError } from './studio-logic';
import { deriveKey } from './secrets';
import {
  buildPreviewRows,
  deleteStoreCredentials,
  fetchCatalogFor,
  getCredentialStatus,
  guessQuantity,
  importSelectionFor,
  listImportRuns,
  loadStoreCredentials,
  priceForWeb,
  regionFor,
  saveStoreCredentials,
  strikePrice,
  toWolleenProductId,
} from './import-logic';

let t: DB;
const key = deriveKey('secret-de-test-import');

const ecPem = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const rsaPem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const appStore = { issuerId: '57246542-96fe-1a63-e053-0824d011072a', keyId: '2X9R4HXF34', privateKey: ecPem, appId: '1561234567' };
const googlePlay = {
  packageName: 'com.novagames.crystal',
  serviceAccount: JSON.stringify({
    type: 'service_account',
    project_id: 'nova',
    private_key_id: 'abc',
    private_key: rsaPem,
    client_email: 'wolleen-import@nova.iam.gserviceaccount.com',
    client_id: '1234',
    token_uri: 'https://oauth2.googleapis.com/token',
  }),
};

async function newGame(name = 'Import test', currency: 'EUR' | 'USD' | 'GBP' = 'EUR') {
  const { game } = await createGameFor(t, 'usr_dev', { name, category: 'RPG', currency });
  return game;
}

beforeAll(async () => {
  t = await createTestDb();
  await t.insert(user).values({ id: 'usr_dev', email: 'dev@test.local', name: 'Dev' });
  await t.insert(studios).values({ id: 'std_t', name: 'Studio T', slug: 'studio-t' });
  await t.insert(studioMembers).values({ studioId: 'std_t', userId: 'usr_dev', role: 'owner' });
});

describe('fonctions pures', () => {
  it('prix web : remise puis palier, bornée à la grille Wolleen', () => {
    expect(priceForWeb(999, 2000)).toEqual({ suggestedCents: 799, webPriceCents: 799 });
    expect(priceForWeb(199, 2000)).toEqual({ suggestedCents: 149, webPriceCents: 149 });
    expect(priceForWeb(999, 0)).toEqual({ suggestedCents: 999, webPriceCents: 999 });
    expect(priceForWeb(14999, 2000)).toMatchObject({ suggestedCents: 11999, webPriceCents: 9999 });
    expect(priceForWeb(49, 2000)).toMatchObject({ suggestedCents: null, webPriceCents: 49 });
    expect(priceForWeb(14999, 2000).note).toMatch(/99,99/);
  });

  it('prix barré = prix store seulement s’il est un palier supérieur', () => {
    expect(strikePrice(999, 799)).toBe(999);
    expect(strikePrice(799, 799)).toBeNull();
    expect(strikePrice(1049, 799)).toBeNull();
  });

  it('identifiant produit et quantité', () => {
    expect(toWolleenProductId('com.nova.gems_100')).toBe('com.nova.gems_100');
    expect(toWolleenProductId('vip:monthly')).toBe('vip.monthly');
    expect(toWolleenProductId(':x')).toBe('x');
    expect(toWolleenProductId('a'.repeat(80))).toHaveLength(64);
    expect(guessQuantity('gems_1200', 'consumable')).toBe(1200);
    expect(guessQuantity('com.nova.gold.10000', 'consumable')).toBe(10000);
    expect(guessQuantity('gems_1200', 'non_consumable')).toBe(1);
    expect(guessQuantity('pack_s7', 'consumable')).toBe(1);
  });

  it('région déduite de la devise du jeu', () => {
    expect(regionFor('EUR')).toMatchObject({ regionCode: 'FR', territory: 'FRA' });
    expect(regionFor('USD')).toMatchObject({ regionCode: 'US', territory: 'USA' });
    expect(regionFor('GBP')).toMatchObject({ regionCode: 'GB', territory: 'GBR' });
  });

  it('aperçu : détecte les existants, les doublons, les devises et périodes douteuses', () => {
    const rows = buildPreviewRows(
      [
        { source: 'app_store', productId: 'gems_1200', type: 'consumable', title: '1 200 gemmes', priceCents: 999, currency: 'EUR' },
        { source: 'app_store', productId: 'old_pack', type: 'non_consumable', title: 'Ancien', priceCents: 299, currency: 'EUR' },
        { source: 'google_play', productId: 'vip:monthly', type: 'auto_renewable', title: 'VIP', priceCents: 499, currency: 'EUR', period: 'month' },
        { source: 'google_play', productId: 'vip.monthly', type: 'auto_renewable', title: 'VIP bis', priceCents: 499, currency: 'EUR', period: 'month' },
        { source: 'app_store', productId: 'pass_q', type: 'auto_renewable', title: 'Pass', priceCents: 1499, currency: 'EUR' },
        { source: 'app_store', productId: 'usd_pack', type: 'consumable', title: 'X'.repeat(120), priceCents: 499, currency: 'USD' },
      ],
      new Map([
        ['gems_1200', true],
        ['old_pack', false],
      ]),
      'EUR',
      2000,
    );
    expect(rows.map((r) => [r.productId, r.existing, r.preselected])).toEqual([
      ['gems_1200', 'active', false],
      ['old_pack', 'archived', false],
      ['vip.monthly', null, true],
      ['vip.monthly', null, false],
      ['pass_q', null, false],
      ['usd_pack', null, false],
    ]);
    expect(rows[0]).toMatchObject({ webPriceCents: 799, quantity: 1200, period: null });
    expect(rows[2]!.notes[0]).toMatch(/Identifiant adapté/);
    expect(rows[3]!.notes.join(' ')).toMatch(/double/);
    expect(rows[4]).toMatchObject({ period: 'month' });
    expect(rows[4]!.notes.join(' ')).toMatch(/Période/);
    expect(rows[5]!.title.length).toBeLessThanOrEqual(80);
    expect(rows[5]!.notes.join(' ')).toMatch(/USD/);
  });
});

describe('identifiants chiffrés', () => {
  it('enregistre chiffré, ne renvoie qu’un rappel, déchiffre côté serveur, remplace et supprime', async () => {
    const game = await newGame('Creds');
    const status = await saveStoreCredentials(t, game.id, 'app_store', appStore, { key });
    expect(status.app_store?.hint).toBe('Key ID 2X9R4HXF34 · app 1561234567');
    expect(status.google_play).toBeNull();
    expect(JSON.stringify(status)).not.toContain('PRIVATE');

    const [row] = await t.select().from(storeCredentials).where(eq(storeCredentials.gameId, game.id));
    expect(row!.ciphertext).not.toContain('PRIVATE');
    expect(row!.ciphertext).not.toContain('2X9R4HXF34');

    await saveStoreCredentials(t, game.id, 'google_play', googlePlay, { key });
    await saveStoreCredentials(t, game.id, 'app_store', { ...appStore, appId: '999999999' }, { key });
    const loaded = await loadStoreCredentials(t, game.id, { key });
    expect(loaded.appStore).toMatchObject({ keyId: '2X9R4HXF34', appId: '999999999' });
    expect(loaded.googlePlay?.packageName).toBe('com.novagames.crystal');
    expect(JSON.parse(loaded.googlePlay!.serviceAccount)).not.toHaveProperty('client_id');
    expect((await t.select().from(storeCredentials).where(eq(storeCredentials.gameId, game.id))).length).toBe(2);

    // Mauvaise clé : erreur lisible plutôt qu'un crash.
    await expect(loadStoreCredentials(t, game.id, { key: deriveKey('autre') })).rejects.toThrow(/illisibles/);

    const after = await deleteStoreCredentials(t, game.id, 'app_store');
    expect(after.app_store).toBeNull();
    expect((await getCredentialStatus(t, game.id)).google_play?.hint).toContain('wolleen-import@nova.iam.gserviceaccount.com');
  });

  it('valide les identifiants (zod)', async () => {
    const game = await newGame('Creds invalides');
    await expect(saveStoreCredentials(t, game.id, 'app_store', { ...appStore, issuerId: 'nope' }, { key })).rejects.toThrow(/Issuer ID/);
    await expect(saveStoreCredentials(t, game.id, 'app_store', { ...appStore, keyId: 'abc' }, { key })).rejects.toThrow(/Key ID/);
    await expect(saveStoreCredentials(t, game.id, 'app_store', { ...appStore, privateKey: 'x'.repeat(60) }, { key })).rejects.toThrow(/\.p8/);
    await expect(saveStoreCredentials(t, game.id, 'app_store', { ...appStore, appId: 'com.app' }, { key })).rejects.toThrow(/Apple ID/);
    await expect(saveStoreCredentials(t, game.id, 'google_play', { ...googlePlay, packageName: 'crystal' }, { key })).rejects.toThrow(/package/);
    await expect(saveStoreCredentials(t, game.id, 'google_play', { ...googlePlay, serviceAccount: '{"a":1}' }, { key })).rejects.toThrow(/compte de service/);
  });
});

describe('récupération du catalogue', () => {
  it('mode démo : passe par le vrai importeur, dédoublonne, avertit et détecte les existants', async () => {
    const game = await newGame('Démo');
    await createItemFor(t, game.id, {
      type: 'consumable', title: 'Sac', productId: 'gems_1200', priceCents: 799, models: [{ label: '' }], layout: 4, style: DEFAULT_ITEM_STYLE,
    });
    const preview = await fetchCatalogFor(t, game.id, { mode: 'demo', userId: 'usr_dev', discountBps: 2000 });
    expect(preview.sources).toEqual(['app_store', 'google_play']);
    expect(preview.currency).toBe('EUR');
    const ids = preview.rows.map((r) => r.productId);
    expect(ids).toContain('gems_100');
    expect(ids.filter((i) => i === 'gems_100')).toHaveLength(1); // dédoublonné entre stores
    expect(ids).toContain('gold_10000'); // Google uniquement
    expect(ids).toContain('vip.monthly');
    expect(ids).not.toContain('event_pass_halloween'); // retiré de la vente
    const gems = preview.rows.find((r) => r.productId === 'gems_1200')!;
    expect(gems).toMatchObject({ source: 'app_store', storePriceCents: 999, webPriceCents: 799, existing: 'active', preselected: false, quantity: 1200 });
    expect(preview.rows.find((r) => r.productId === 'remove_ads')).toMatchObject({ type: 'non_consumable', storePriceCents: 399 });
    expect(preview.rows.find((r) => r.productId === 'pass_royal_yearly')).toMatchObject({ type: 'auto_renewable', period: 'year' });
    expect(preview.rows.find((r) => r.productId === 'mega_bundle')).toMatchObject({ webPriceCents: 9999 });
    const codes = preview.warnings.map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(['inactive', 'unsupported_period', 'no_price']));

    const [run] = await t.select().from(importRuns).where(eq(importRuns.id, preview.runId));
    expect(run).toMatchObject({ gameId: game.id, mode: 'demo', status: 'fetched', userId: 'usr_dev' });
    expect(run!.productsFound).toBe(preview.rows.length);
  });

  it('mode démo en dollars pour un jeu en USD', async () => {
    const game = await newGame('Démo US', 'USD');
    const preview = await fetchCatalogFor(t, game.id, { mode: 'demo' });
    expect(preview.rows.every((r) => r.storeCurrency === 'USD')).toBe(true);
    expect(preview.regionLabel).toBe('États-Unis');
  });

  it('mode live : exige des identifiants, journalise un échec complet', async () => {
    const game = await newGame('Live');
    await expect(fetchCatalogFor(t, game.id, { mode: 'live', key })).rejects.toThrow(/Aucun identifiant/);

    await saveStoreCredentials(t, game.id, 'app_store', appStore, { key });
    const denied: FetchLike = async () => new Response(JSON.stringify({ errors: [{ status: '401', code: 'NOT_AUTHORIZED' }] }), { status: 401 });
    await expect(fetchCatalogFor(t, game.id, { mode: 'live', key, fetch: denied })).rejects.toThrow(/App Store/);
    const runs = await listImportRuns(t, game.id);
    expect(runs[0]).toMatchObject({ status: 'failed', mode: 'live' });
    expect(runs[0]!.error).toBeTruthy();
  });

  it('mode live : utilise les identifiants déchiffrés et le territoire du jeu', async () => {
    const game = await newGame('Live OK', 'GBP');
    await saveStoreCredentials(t, game.id, 'app_store', appStore, { key });
    const seen: string[] = [];
    const fetch: FetchLike = async (input, init) => {
      const u = new URL(input);
      seen.push(u.pathname + (u.searchParams.get('filter[territory]') ? `?${u.searchParams.get('filter[territory]')}` : ''));
      expect(String((init?.headers as Record<string, string>)?.Authorization)).toMatch(/^Bearer ey/);
      const empty = { data: [], links: { self: 'x' } };
      if (u.pathname.endsWith('/inAppPurchasesV2')) {
        return Response.json({
          data: [{ type: 'inAppPurchases', id: '1', attributes: { productId: 'coins', inAppPurchaseType: 'CONSUMABLE', state: 'APPROVED', name: 'Coins' }, relationships: { iapPriceSchedule: { data: { type: 'inAppPurchasePriceSchedules', id: '1' } } } }],
          links: { self: 'x' },
        });
      }
      if (u.pathname.endsWith('/manualPrices')) {
        return Response.json({
          data: [{ type: 'inAppPurchasePrices', id: 'p', attributes: { startDate: null }, relationships: { inAppPurchasePricePoint: { data: { type: 'inAppPurchasePricePoints', id: 'pp' } }, territory: { data: { type: 'territories', id: 'GBR' } } } }],
          included: [{ type: 'territories', id: 'GBR', attributes: { currency: 'GBP' } }, { type: 'inAppPurchasePricePoints', id: 'pp', attributes: { customerPrice: '1.99' } }],
          links: { self: 'x' },
        });
      }
      return Response.json(empty);
    };
    const preview = await fetchCatalogFor(t, game.id, { mode: 'live', key, fetch, discountBps: 0 });
    expect(seen).toContain('/v1/apps/1561234567/inAppPurchasesV2');
    expect(seen).toContain('/v1/inAppPurchasePriceSchedules/1/manualPrices?GBR');
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({ productId: 'coins', storePriceCents: 199, storeCurrency: 'GBP', webPriceCents: 199 });
  });

  it('refuse une remise hors bornes', async () => {
    const game = await newGame('Remise');
    await expect(fetchCatalogFor(t, game.id, { mode: 'demo', discountBps: 9500 })).rejects.toThrow(StudioError);
  });
});

describe('import de la sélection', () => {
  it('crée les articles (style par défaut, layout 4), saute les existants et les prix hors palier', async () => {
    const game = await newGame('Import');
    const archived = await createItemFor(t, game.id, {
      type: 'consumable', title: 'Vieux', productId: 'old_pack', priceCents: 99, models: [{ label: '' }], layout: 1, style: DEFAULT_ITEM_STYLE,
    });
    // Archivé (une vente existe) : simulons-le directement.
    await t.update(items).set({ active: false }).where(eq(items.id, archived.id));

    const preview = await fetchCatalogFor(t, game.id, { mode: 'demo' });
    const pick = (id: string) => {
      const r = preview.rows.find((x) => x.productId === id)!;
      return { productId: r.productId, type: r.type, period: r.period, title: r.title, subtitle: r.subtitle, storePriceCents: r.storePriceCents, priceCents: r.webPriceCents, quantity: r.quantity };
    };
    const outcome = await importSelectionFor(t, game.id, {
      runId: preview.runId,
      showStorePrice: true,
      items: [
        pick('gems_1200'),
        pick('pass_royal_yearly'),
        pick('vip.monthly'),
        { ...pick('gems_100'), priceCents: 123 }, // hors palier
        { ...pick('gems_550'), productId: 'old_pack' }, // archivé
      ],
    });
    expect(outcome.created.map((c) => c.productId)).toEqual(['gems_1200', 'pass_royal_yearly', 'vip.monthly']);
    expect(outcome.skipped.map((s) => s.productId)).toEqual(['gems_100', 'old_pack']);
    expect(outcome.skipped[0]!.reason).toMatch(/palier/);
    expect(outcome.skipped[1]!.reason).toMatch(/archivé/);

    const rows = await t.select().from(items).where(eq(items.gameId, game.id));
    const gems = rows.find((r) => r.productId === 'gems_1200')!;
    expect(gems).toMatchObject({ layout: 4, style: DEFAULT_ITEM_STYLE, priceCents: 799, oldPriceCents: 999, quantity: 1200, active: true, title: 'Sac de 1 200 gemmes' });
    expect(rows.find((r) => r.productId === 'pass_royal_yearly')).toMatchObject({ type: 'auto_renewable', period: 'year' });

    const [run] = await t.select().from(importRuns).where(eq(importRuns.id, preview.runId));
    expect(run).toMatchObject({ status: 'imported', itemsCreated: 3 });

    // Deuxième import : déjà présents.
    const again = await importSelectionFor(t, game.id, { runId: preview.runId, items: [pick('gems_1200')], showStorePrice: false });
    expect(again.created).toEqual([]);
    expect(again.skipped[0]!.reason).toMatch(/déjà utilisé/);
  });

  it('sans prix barré, avec un run d’un autre jeu refusé, sélection vide refusée', async () => {
    const game = await newGame('Import 2');
    const other = await newGame('Autre');
    const preview = await fetchCatalogFor(t, other.id, { mode: 'demo' });
    const item = { productId: 'coins_500', type: 'consumable' as const, title: 'Pièces', storePriceCents: 499, priceCents: 399 };
    await expect(importSelectionFor(t, game.id, { runId: preview.runId, items: [item] })).rejects.toThrow(/introuvable/);
    await expect(importSelectionFor(t, other.id, { runId: preview.runId, items: [] })).rejects.toThrow(/au moins un/);
    const ok = await importSelectionFor(t, other.id, { runId: preview.runId, items: [item], showStorePrice: false });
    const [row] = await t.select().from(items).where(eq(items.id, ok.created[0]!.itemId));
    expect(row).toMatchObject({ oldPriceCents: null, priceCents: 399, quantity: 1 });
    await deleteItemFor(t, other.id, row!.id);
  });
});
