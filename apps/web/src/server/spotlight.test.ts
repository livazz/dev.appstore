import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  process.env.DEVAPPSTORE_DATA_DIR = mkdtempSync(join(tmpdir(), 'devappstore-spotlight-test-'));
});

import { DEFAULT_ITEM_STYLE, DEFAULT_THEME } from '@devappstore/core';
import { games, items, orders, studios, user, type DB, type GameSpotlight } from '@devappstore/db';
import { createTestDb } from '@devappstore/db/testing';
import { getSpotlights, parseSpotlight } from './spotlight';

let t: DB;
const NOW = new Date();
const D = 86_400_000;

const spot = (productId: string, v: Partial<GameSpotlight> = {}): GameSpotlight => ({
  headline: 'Un très bon jeu', reasons: ['Raison 1', 'Raison 2'], productId, angle: 'start', pitch: 'Idéal pour débuter.', ...v,
});
const game = (id: string, v: Partial<typeof games.$inferInsert> = {}) => ({
  id, studioId: 'std_s', slug: id.replace('gam_', ''), name: id, publisherName: 'Studio S', theme: DEFAULT_THEME,
  webhookSecret: 'whsec_x', apiKeyHash: 'hash', apiKeyPrefix: 'das_test', status: 'live' as const, ...v,
});
const item = (id: string, gameId: string, v: Partial<typeof items.$inferInsert> = {}) => ({
  id, gameId, productId: id, title: id, priceCents: 499, style: DEFAULT_ITEM_STYLE, ...v,
});
let n = 0;
const order = (gameId: string, itemId: string) => ({
  id: `ord_s_${n++}`, userId: 'usr_s', gameId, itemId, productId: itemId, itemTitle: itemId, playerId: 'P1', amountCents: 499,
  platformFeeCents: 50, currency: 'EUR' as const, status: 'paid' as const, paidAt: new Date(NOW.getTime() - D),
});

beforeAll(async () => {
  t = await createTestDb();
  await t.insert(user).values({ id: 'usr_s', name: 'S', email: 's@test.local', emailVerified: true });
  await t.insert(studios).values({ id: 'std_s', name: 'Studio S', slug: 'studio-s' });
  await t.insert(games).values([
    game('gam_a', { name: 'Alpha', platform: 'mobile', spotlight: spot('itm_a', { angle: 'top' }), screenshots: ['/art/games/a/hero.webp'] }),
    game('gam_b', { name: 'Bravo', platform: 'mobile', spotlight: spot('itm_b') }),
    game('gam_pc', { name: 'Charlie PC', platform: 'pc', spotlight: spot('itm_pc') }),
    game('gam_plain', { name: 'Sans présentation', platform: 'mobile' }),
    game('gam_draft', { name: 'Brouillon', platform: 'mobile', status: 'draft', spotlight: spot('itm_draft') }),
    game('gam_gone', { name: 'Article retiré', platform: 'mobile', spotlight: spot('itm_inconnu') }),
    game('gam_off', { name: 'Article désactivé', platform: 'mobile', spotlight: spot('itm_off') }),
    game('gam_bad', { name: 'JSON invalide', platform: 'mobile', spotlight: { headline: 'x' } as unknown as GameSpotlight }),
  ]);
  await t.insert(items).values([
    item('itm_a', 'gam_a', { title: 'Pass', priceCents: 599, oldPriceCents: 799, promoStartsAt: new Date(NOW.getTime() - D), promoEndsAt: new Date(NOW.getTime() + D) }),
    item('itm_b', 'gam_b', { title: 'Pack', oldPriceCents: 999 }),
    item('itm_pc', 'gam_pc'),
    item('itm_draft', 'gam_draft'),
    item('itm_off', 'gam_off', { active: false }),
  ]);
  // Bravo vend plus qu'Alpha : il passe devant. Charlie PC n'a aucune vente.
  await t.insert(orders).values([order('gam_b', 'itm_b'), order('gam_b', 'itm_b'), order('gam_a', 'itm_a')]);
});

describe('parseSpotlight', () => {
  it('accepte une présentation complète et borne les raisons à 4', () => {
    const s = parseSpotlight({ ...spot('p1'), reasons: ['a', 'b', 'c', 'd', 'e', '  '] });
    expect(s?.reasons).toEqual(['a', 'b', 'c', 'd']);
    expect(s?.productId).toBe('p1');
  });
  it('refuse les formes incomplètes ou inconnues', () => {
    expect(parseSpotlight(null)).toBeNull();
    expect(parseSpotlight('texte')).toBeNull();
    expect(parseSpotlight({ ...spot('p1'), angle: 'autre' })).toBeNull();
    expect(parseSpotlight({ ...spot('p1'), reasons: [] })).toBeNull();
    expect(parseSpotlight({ ...spot('p1'), pitch: '   ' })).toBeNull();
  });
});

describe('getSpotlights', () => {
  it('ne garde que les jeux live présentés dont l’article est actif, classés par ventes', async () => {
    const list = await getSpotlights({ now: NOW }, t);
    expect(list.map((s) => s.game.id)).toEqual(['gam_b', 'gam_a', 'gam_pc']);
    expect(list.map((s) => s.rank)).toEqual([1, 2, null]);
  });
  it('expose l’article conseillé, son angle et son prix barré seulement pendant la promo', async () => {
    const list = await getSpotlights({ now: NOW }, t);
    const a = list.find((s) => s.game.id === 'gam_a')!;
    expect(a.angle).toBe('top');
    expect(a.game.cover).toBe('/art/games/a/hero.webp');
    expect(a.item).toMatchObject({ id: 'itm_a', title: 'Pass', priceCents: 599, oldPriceCents: 799, discountPct: 25 });
    // Prix barré sans fenêtre de promo : la règle de lib/promo décide (identique aux autres rangées de l'accueil).
    const b = list.find((s) => s.game.id === 'gam_b')!;
    expect(b.item.priceCents).toBe(499);
  });
  it('filtre par plateforme et respecte la limite', async () => {
    expect((await getSpotlights({ platform: 'pc', now: NOW }, t)).map((s) => s.game.id)).toEqual(['gam_pc']);
    expect((await getSpotlights({ platform: 'mobile', limit: 1, now: NOW }, t)).map((s) => s.game.id)).toEqual(['gam_b']);
  });
});

describe('rankLabel', () => {
  it('donne le rang dans le top 10, « Top 50 » ensuite, rien au-delà', async () => {
    const { rankLabel } = await import('@/components/catalog/SpotlightSection');
    expect(rankLabel({ rank: 3, game: { platform: 'mobile' } })).toBe('N° 3 du top mobile');
    expect(rankLabel({ rank: 27, game: { platform: 'pc' } })).toBe('Top 50 PC');
    expect(rankLabel({ rank: 51, game: { platform: 'pc' } })).toBeNull();
    expect(rankLabel({ rank: null, game: { platform: 'mobile' } })).toBeNull();
  });
});
