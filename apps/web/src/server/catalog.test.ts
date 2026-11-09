import { beforeAll, describe, expect, it, vi } from 'vitest';

// `server-only` lève une erreur hors du bundle serveur de Next ; la base par défaut ne doit pas toucher .data/.
vi.mock('server-only', () => ({}));
await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  process.env.WOLLEEN_DATA_DIR = mkdtempSync(join(tmpdir(), 'wolleen-catalog-test-'));
});

import { DEFAULT_ITEM_STYLE, DEFAULT_THEME } from '@wolleen/core';
import { games, items, studios, type DB } from '@wolleen/db';
import { createTestDb } from '@wolleen/db/testing';
import {
  discountPct,
  escapeLike,
  getHomeCatalog,
  getLiveGameBySlug,
  groupByCategory,
  listLiveGames,
  maxDiscountPct,
  normalizeCategory,
  pickFeatured,
  searchCatalog,
  type CatalogGame,
} from './catalog';

let t: DB;

const game = (id: string, v: Partial<typeof games.$inferInsert> = {}) => ({
  id,
  studioId: 'std_t',
  slug: id.replace('gam_', ''),
  name: id,
  theme: DEFAULT_THEME,
  webhookSecret: 'whsec_x',
  apiKeyHash: 'hash',
  apiKeyPrefix: 'wk_test',
  status: 'live' as const,
  ...v,
});
const item = (id: string, gameId: string, v: Partial<typeof items.$inferInsert> = {}) => ({
  id,
  gameId,
  productId: id,
  title: id,
  priceCents: 499,
  style: DEFAULT_ITEM_STYLE,
  ...v,
});

beforeAll(async () => {
  t = await createTestDb();
  await t.insert(studios).values({ id: 'std_t', name: 'Studio T', slug: 'studio-t' });
  await t.insert(games).values([
    game('gam_crystal', { name: 'Crystal Clash', subtitle: 'PvP épique', publisherName: 'Nova Games', category: 'Stratégie', description: 'Decks et batailles' }),
    game('gam_farm', { name: 'Pixel Farm', subtitle: 'Cultivez', publisherName: 'Nova Games', category: 'Simulation' }),
    game('gam_race', { name: 'Turbo 100%', category: 'Course' }),
    game('gam_draft', { name: 'Brouillon Crystal', category: 'Stratégie', status: 'draft' }),
    game('gam_empty', { name: 'Arcade Vide', category: 'Inconnue' }),
  ]);
  await t.insert(items).values([
    item('itm_gems', 'gam_crystal', { title: 'Sac de gemmes', priceCents: 799, oldPriceCents: 1099, keywords: ['Gemmes', 'Monnaie'], position: 1 }),
    item('itm_starter', 'gam_crystal', { title: 'Pack débutant', priceCents: 299, oldPriceCents: 999, keywords: ['Packs'], position: 0 }),
    item('itm_hidden', 'gam_crystal', { title: 'Gemmes cachées', priceCents: 1, oldPriceCents: 1000, active: false }),
    item('itm_seeds', 'gam_farm', { title: 'Graines', subtitle: '50 graines rares', priceCents: 199 }),
    item('itm_coins', 'gam_farm', { title: 'Bourse', priceCents: 499, oldPriceCents: 699, keywords: ['Monnaie'] }),
    item('itm_race', 'gam_race', { title: 'Nitro', priceCents: 100 }),
    item('itm_draft', 'gam_draft', { title: 'Gemmes brouillon', priceCents: 100, oldPriceCents: 900 }),
  ]);
}, 60000);

describe('calculs purs', () => {
  it('discountPct', () => {
    expect(discountPct(299, 999)).toBe(70);
    expect(discountPct(799, 1099)).toBe(27);
    expect(discountPct(500, null)).toBe(0);
    expect(discountPct(500, 500)).toBe(0);
    expect(discountPct(600, 500)).toBe(0);
    expect(discountPct(0, 0)).toBe(0);
  });
  it('maxDiscountPct', () => {
    expect(maxDiscountPct([])).toBe(0);
    expect(maxDiscountPct([{ priceCents: 799, oldPriceCents: 1099 }, { priceCents: 299, oldPriceCents: 999 }])).toBe(70);
  });
  it('escapeLike et normalizeCategory', () => {
    expect(escapeLike('100%_a\\b')).toBe('100\\%\\_a\\\\b');
    expect(normalizeCategory('stratégie')).toBe('Stratégie');
    expect(normalizeCategory('n-importe')).toBeNull();
    expect(normalizeCategory('')).toBeNull();
  });
  it('groupByCategory suit GAME_CATEGORIES puis les inconnues', () => {
    const g = (name: string, category: string): CatalogGame => ({ id: name, slug: name, name, subtitle: '', publisherName: '', category, iconUrl: null, maxDiscountPct: 0, itemCount: 1 });
    const rows = groupByCategory([g('a', 'Zzz'), g('b', 'Casual'), g('c', 'Action'), g('d', 'Casual')]);
    expect(rows.map((r) => r.category)).toEqual(['Action', 'Casual', 'Zzz']);
    expect(rows[1].games.map((x) => x.name)).toEqual(['b', 'd']);
  });
  it('pickFeatured trie par réduction et ignore les boutiques vides', () => {
    const g = (name: string, d: number, n = 1): CatalogGame => ({ id: name, slug: name, name, subtitle: '', publisherName: '', category: 'Casual', iconUrl: null, maxDiscountPct: d, itemCount: n });
    expect(pickFeatured([g('a', 10), g('b', 50), g('c', 90, 0), g('d', 50)], 2).map((x) => x.name)).toEqual(['b', 'd']);
  });
});

describe('requêtes', () => {
  it('listLiveGames : seulement les jeux live, avec réduction max des articles actifs', async () => {
    const list = await listLiveGames(t);
    expect(list.map((g) => g.id)).toEqual(['gam_empty', 'gam_crystal', 'gam_farm', 'gam_race']);
    const crystal = list.find((g) => g.id === 'gam_crystal')!;
    expect(crystal.maxDiscountPct).toBe(70); // l'article inactif à -99 % est ignoré
    expect(crystal.itemCount).toBe(2);
    expect(list.find((g) => g.id === 'gam_farm')!.maxDiscountPct).toBe(28);
    expect(list.find((g) => g.id === 'gam_empty')!.itemCount).toBe(0);
    expect(Object.keys(crystal)).not.toContain('webhookSecret');
  });

  it('getHomeCatalog', async () => {
    const home = await getHomeCatalog(t);
    expect(home.total).toBe(4);
    expect(home.featured[0].id).toBe('gam_crystal');
    expect(home.featured.map((g) => g.id)).not.toContain('gam_empty');
    expect(home.categories.map((c) => c.category)).toEqual(['Stratégie', 'Simulation', 'Course', 'Inconnue']);
  });

  it('searchCatalog : jeux et articles correspondants', async () => {
    const r = await searchCatalog({ q: 'gemmes' }, t);
    expect(r.games).toEqual([]);
    expect(r.items.map((i) => i.item.id)).toEqual(['itm_gems']); // ni inactif ni brouillon
    expect(r.items[0].game).toMatchObject({ slug: 'crystal', name: 'Crystal Clash', currency: 'EUR' });

    const nova = await searchCatalog({ q: '  nova ' }, t);
    expect(nova.games.map((g) => g.id)).toEqual(['gam_crystal', 'gam_farm']);

    const kw = await searchCatalog({ q: 'monnaie' }, t);
    expect(kw.items.map((i) => i.item.id).sort()).toEqual(['itm_coins', 'itm_gems']);

    const sub = await searchCatalog({ q: 'rares' }, t);
    expect(sub.items.map((i) => i.item.id)).toEqual(['itm_seeds']);
  });

  it('searchCatalog : filtre catégorie et jokers échappés', async () => {
    expect((await searchCatalog({ q: 'nova', cat: 'Simulation' }, t)).games.map((g) => g.id)).toEqual(['gam_farm']);
    const cat = await searchCatalog({ cat: 'stratégie' }, t);
    expect(cat.category).toBe('Stratégie');
    expect(cat.games.map((g) => g.id)).toEqual(['gam_crystal']);
    expect(cat.items).toEqual([]);
    expect((await searchCatalog({ q: '100%' }, t)).games.map((g) => g.id)).toEqual(['gam_race']);
    expect((await searchCatalog({ q: '%' }, t)).games.map((g) => g.id)).toEqual(['gam_race']);
    expect(await searchCatalog({ q: '', cat: 'inconnue-xyz' }, t)).toEqual({ q: '', category: null, games: [], items: [] });
  });

  it('getLiveGameBySlug : boutique live avec articles actifs triés', async () => {
    const g = await getLiveGameBySlug('crystal', t);
    expect(g?.name).toBe('Crystal Clash');
    expect(g?.items.map((i) => i.id)).toEqual(['itm_starter', 'itm_gems']);
    expect(g && 'apiKeyHash' in g).toBe(false);
    expect(await getLiveGameBySlug('draft', t)).toBeNull();
    expect(await getLiveGameBySlug('absent', t)).toBeNull();
  });
});
