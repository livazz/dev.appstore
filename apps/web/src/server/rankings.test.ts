import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  process.env.DEVAPPSTORE_DATA_DIR = mkdtempSync(join(tmpdir(), 'devappstore-rankings-test-'));
});

import { DEFAULT_ITEM_STYLE, DEFAULT_THEME } from '@devappstore/core';
import { gameReviews, games, items, orders, studios, user, type DB } from '@devappstore/db';
import { createTestDb } from '@devappstore/db/testing';
import { getHomeCatalog, getLiveGameBySlug, getPromoItems, listLiveGames, searchCatalog } from './catalog';
import { getGameRanking, getItemRanking } from './rankings';

let t: DB;
const NOW = new Date();
const H = 3_600_000;
const D = 24 * H;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const later = (ms: number) => new Date(NOW.getTime() + ms);

const game = (id: string, v: Partial<typeof games.$inferInsert> = {}) => ({
  id,
  studioId: 'std_r',
  slug: id.replace('gam_', ''),
  name: id,
  publisherName: 'Studio R',
  theme: DEFAULT_THEME,
  webhookSecret: 'whsec_x',
  apiKeyHash: 'hash',
  apiKeyPrefix: 'das_test',
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
let n = 0;
const order = (gameId: string, itemId: string, v: Partial<typeof orders.$inferInsert> = {}) => ({
  id: `ord_r_${n++}`,
  userId: 'usr_r',
  gameId,
  itemId,
  productId: itemId,
  itemTitle: itemId,
  playerId: 'P1',
  amountCents: 499,
  platformFeeCents: 50,
  currency: 'EUR' as const,
  status: 'paid' as const,
  paidAt: ago(D),
  ...v,
});

beforeAll(async () => {
  t = await createTestDb();
  await t.insert(user).values({ id: 'usr_r', name: 'R', email: 'r@test.local', emailVerified: true });
  await t.insert(studios).values({ id: 'std_r', name: 'Studio R', slug: 'studio-r' });
  await t.insert(games).values([
    game('gam_m1', { name: 'Alpha Mobile', category: 'Action', platform: 'mobile' }),
    game('gam_m2', { name: 'Bravo Mobile', category: 'Casual', platform: 'mobile' }),
    game('gam_m3', { name: 'Charlie Mobile', category: 'Action', platform: 'mobile' }),
    game('gam_p1', { name: 'Delta PC', category: 'Action', platform: 'pc' }),
    game('gam_draft', { name: 'Brouillon', platform: 'mobile', status: 'draft' }),
  ]);
  await t.insert(items).values([
    item('itm_m1', 'gam_m1', { title: 'Gemmes', priceCents: 399, oldPriceCents: 499, promoStartsAt: ago(H), promoEndsAt: later(2 * D) }),
    item('itm_m1b', 'gam_m1', { title: 'Or', priceCents: 199, oldPriceCents: 999, promoEndsAt: ago(H) }), // promo terminée
    item('itm_m2', 'gam_m2', { title: 'Pièces', priceCents: 299, oldPriceCents: 599, promoStartsAt: later(3 * D), promoEndsAt: later(5 * D) }), // à venir
    item('itm_m3', 'gam_m3', { title: 'Pack', priceCents: 999, oldPriceCents: 1999 }), // prix barré permanent
    item('itm_p1', 'gam_p1', { title: 'Skin', priceCents: 1499, oldPriceCents: 1999, promoStartsAt: later(30 * D) }), // trop loin
    item('itm_draft', 'gam_draft', { title: 'X', priceCents: 100, oldPriceCents: 900, promoEndsAt: later(D) }),
  ]);
  await t.insert(orders).values([
    // gam_m2 : 3 ventes ; gam_m1 : 2 (+ 1 remboursée, + 1 hors fenêtre) ; gam_m3 : 2 (départage par nom : Alpha < Charlie)
    order('gam_m2', 'itm_m2', { quantity: 2 }),
    order('gam_m2', 'itm_m2'),
    order('gam_m1', 'itm_m1'),
    order('gam_m1', 'itm_m1b'),
    order('gam_m1', 'itm_m1', { status: 'refunded' }),
    order('gam_m1', 'itm_m1', { paidAt: ago(40 * D) }),
    order('gam_m3', 'itm_m3', { quantity: 2, paidAt: ago(10 * D) }),
    order('gam_p1', 'itm_p1'),
    order('gam_draft', 'itm_draft', { quantity: 9 }),
    // il y a une semaine, gam_m3 menait
    order('gam_m3', 'itm_m3', { quantity: 5, paidAt: ago(35 * D) }),
  ]);
  await t.insert(gameReviews).values([
    { id: 'rev_1', gameId: 'gam_m1', authorName: 'A', rating: 5 },
    { id: 'rev_2', gameId: 'gam_m1', authorName: 'B', rating: 4 },
    { id: 'rev_3', gameId: 'gam_m1', authorName: 'C', rating: 1, status: 'hidden' },
  ]);
}, 60000);

describe('règle de promo dans le catalogue', () => {
  it('maxDiscountPct ne compte que les promos en cours', async () => {
    const list = await listLiveGames(t);
    const pct = Object.fromEntries(list.map((g) => [g.id, g.maxDiscountPct]));
    expect(pct).toMatchObject({ gam_m1: 20, gam_m2: 0, gam_m3: 50, gam_p1: 0 });
    expect(list.find((g) => g.id === 'gam_p1')!.platform).toBe('pc');
  });

  it('boutique et recherche : prix barré masqué hors fenêtre, prix inchangé', async () => {
    const g = await getLiveGameBySlug('m1', t);
    const byId = Object.fromEntries(g!.items.map((i) => [i.id, i]));
    expect(byId.itm_m1).toMatchObject({ priceCents: 399, oldPriceCents: 499 });
    expect(byId.itm_m1b).toMatchObject({ priceCents: 199, oldPriceCents: null });
    expect(Object.keys(byId.itm_m1)).not.toContain('promoEndsAt');
    const r = await searchCatalog({ q: 'pièces' }, t);
    expect(r.items[0].item).toMatchObject({ priceCents: 299, oldPriceCents: null });
  });

  it('filtre de plateforme de l’accueil', async () => {
    const home = await getHomeCatalog(t, { platform: 'pc' });
    expect(home.total).toBe(1);
    expect(home.categories.flatMap((c) => c.games.map((x) => x.id))).toEqual(['gam_p1']);
  });

  it('promos du jour (limitées dans le temps) et à venir (≤ 14 jours)', async () => {
    const p = await getPromoItems({ now: NOW }, t);
    expect(p.live.map((i) => i.id)).toEqual(['itm_m1']);
    expect(p.live[0]).toMatchObject({ priceCents: 399, oldPriceCents: 499, discountPct: 20, game: { slug: 'm1', platform: 'mobile' } });
    expect(p.upcoming.map((i) => i.id)).toEqual(['itm_m2']);
    expect((await getPromoItems({ now: NOW, platform: 'pc' }, t)).live).toEqual([]);
  });
});

describe('classements', () => {
  it('Top mobile : ventes payées sur 30 jours, départage par nom, live seulement', async () => {
    const r = await getGameRanking({ platform: 'mobile', now: NOW }, t);
    expect(r.map((x) => [x.rank, x.entry.id, x.units])).toEqual([
      [1, 'gam_m2', 3],
      [2, 'gam_m1', 2],
      [3, 'gam_m3', 2],
    ]);
    expect(r[1].entry.rating).toEqual({ average: 4.5, count: 2 });
    expect(r[0].entry.rating).toBeNull();
    const m3 = r.find((x) => x.entry.id === 'gam_m3')!;
    expect(m3).toMatchObject({ previousRank: 1, trend: 'down', delta: -2 });
    expect(r[0].trend).toBe('new');
  });

  it('filtre de catégorie et plateforme PC', async () => {
    const action = await getGameRanking({ platform: 'mobile', category: 'action', now: NOW }, t);
    expect(action.map((x) => x.entry.id)).toEqual(['gam_m1', 'gam_m3']);
    const pc = await getGameRanking({ platform: 'pc', now: NOW }, t);
    expect(pc.map((x) => x.entry.id)).toEqual(['gam_p1']);
  });

  it('Top achats : articles actifs, prix barré selon la promo', async () => {
    const r = await getItemRanking({ now: NOW }, t);
    expect(r.map((x) => x.entry.id)).toEqual(['itm_m2', 'itm_m3', 'itm_m1', 'itm_m1b', 'itm_p1']);
    const byId = Object.fromEntries(r.map((x) => [x.entry.id, x.entry]));
    expect(byId.itm_m2).toMatchObject({ oldPriceCents: null, discountPct: 0 });
    expect(byId.itm_m1).toMatchObject({ oldPriceCents: 499, discountPct: 20 });
    expect(r.map((x) => x.entry.id)).not.toContain('itm_draft');
    const casual = await getItemRanking({ now: NOW, category: 'Casual' }, t);
    expect(casual.map((x) => x.entry.id)).toEqual(['itm_m2']);
  });
});
