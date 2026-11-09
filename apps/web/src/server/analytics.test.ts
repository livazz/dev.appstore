import { beforeAll, describe, expect, it, vi } from 'vitest';

// `server-only` lève une erreur hors de Next ; la base par défaut (@wolleen/db) ne doit pas toucher .data.
vi.mock('server-only', () => ({}));
await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  process.env.WOLLEEN_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'wolleen-analytics-'));
});

import { createTestDb } from '@wolleen/db/testing';
import { deliveries, games, items, orders, studios, user, type DB } from '@wolleen/db';
import type { Currency, DeliveryStatus, OrderStatus } from '@wolleen/core';
import {
  getDailyRevenue,
  getPlayerPurchases,
  getSalesTotals,
  getTopItems,
  getTransactions,
  localDay,
  salesWindow,
  transactionsToCsv,
} from './analytics';

const NOW = new Date('2026-11-09T12:00:00Z'); // lundi, 13h à Paris
let t: DB;
let seq = 0;

async function order(o: {
  at: string;
  amount: number;
  fee?: number;
  currency?: Currency;
  status?: OrderStatus;
  game?: string;
  item?: 'gems' | 'gold';
  user?: string;
  delivery?: DeliveryStatus;
}) {
  const id = `ord_t${String(++seq).padStart(3, '0')}`;
  const game = o.game ?? 'gam_a';
  const item = o.item ?? 'gems';
  await t.insert(orders).values({
    id,
    userId: o.user ?? 'usr_p',
    gameId: game,
    itemId: `itm_${game}_${item}`,
    productId: item,
    itemTitle: item === 'gems' ? 'Gemmes' : 'Or',
    playerId: '#P1',
    amountCents: o.amount,
    platformFeeCents: o.fee ?? Math.round(o.amount * 0.05),
    currency: o.currency ?? 'EUR',
    status: o.status ?? 'paid',
    createdAt: new Date(o.at),
    paidAt: (o.status ?? 'paid') === 'paid' ? new Date(o.at) : null,
  });
  if (o.delivery) {
    await t.insert(deliveries).values({
      id: `dlv_${id}`,
      orderId: id,
      gameId: game,
      playerId: '#P1',
      status: o.delivery,
      payload: {
        event: 'purchase.completed', delivery_id: `dlv_${id}`, order_id: id, game_id: game, player_id: '#P1', product_id: item,
        item_type: 'consumable', quantity: 1, amount_cents: o.amount, currency: o.currency ?? 'EUR', created_at: o.at,
      },
    });
  }
  return id;
}

beforeAll(async () => {
  t = await createTestDb();
  await t.insert(user).values([
    { id: 'usr_p', name: 'P', email: 'p@test', emailVerified: true },
    { id: 'usr_q', name: 'Q', email: 'q@test', emailVerified: true },
  ]);
  await t.insert(studios).values({ id: 'std_t', name: 'T', slug: 't' });
  const theme = { gradient: { enabled: false, c1: '#000', c2: '#fff', style: 'linear' as const }, grid: { width: 200, height: 260, margin: 24 } };
  for (const id of ['gam_a', 'gam_b']) {
    await t.insert(games).values({ id, studioId: 'std_t', slug: id, name: id === 'gam_a' ? 'Jeu A' : 'Jeu B', theme, webhookSecret: 's', apiKeyHash: 'h', apiKeyPrefix: 'p' });
    for (const p of ['gems', 'gold'])
      await t.insert(items).values({
        id: `itm_${id}_${p}`, gameId: id, productId: p, title: p, priceCents: 100,
        style: { bgType: 'solid', bg1: '', bg2: '', titleColor: '', titleBg: '', titleOutline: false, titleShadow: false, subtitleColor: '', priceColor: '', priceBg: '', priceOutline: false, priceShadow: false, borderWidth: 0, borderColor: '', rounded: true, shadow: false },
      });
  }

  // Dans la fenêtre de 7 jours (3 → 9 nov., heure de Paris)
  await order({ at: '2026-11-09T09:00:00Z', amount: 1000, fee: 50, delivery: 'acknowledged' });
  await order({ at: '2026-11-08T23:30:00Z', amount: 500, fee: 25, item: 'gold', delivery: 'pending' }); // 9 nov. 0h30 à Paris, 8 nov. en UTC
  await order({ at: '2026-11-03T00:30:00Z', amount: 2000, fee: 100, delivery: 'delivered' }); // 3 nov. 1h30 Paris : inclus
  await order({ at: '2026-11-02T22:30:00Z', amount: 999, fee: 0 }); // 2 nov. 23h30 Paris : exclu de 7 j
  // Hors-fenêtre / à ignorer
  await order({ at: '2026-11-09T13:00:00Z', amount: 7777 }); // dans le futur par rapport à NOW
  await order({ at: '2026-11-05T10:00:00Z', amount: 4000, status: 'refunded', delivery: 'acknowledged' });
  await order({ at: '2026-11-05T10:00:00Z', amount: 3000, status: 'pending' });
  await order({ at: '2026-11-06T10:00:00Z', amount: 1200, fee: 60, currency: 'USD', delivery: 'failed' });
  await order({ at: '2026-11-06T10:00:00Z', amount: 9999, game: 'gam_b', user: 'usr_q' });
  await order({ at: '2026-09-01T10:00:00Z', amount: 300, fee: 15 }); // ~69 jours avant : seulement 90 j
}, 30000);

describe('salesWindow', () => {
  it('compte N jours calendaires dans le fuseau, aujourd’hui inclus', () => {
    const w = salesWindow({ days: 7, now: NOW });
    expect(w.startDay).toBe('2026-11-03');
    expect(w.endDay).toBe('2026-11-09');
    expect(w.dayList).toHaveLength(7);
  });
  it('gère le changement d’heure et les fins de mois', () => {
    expect(localDay(new Date('2026-03-28T23:30:00Z'), 'Europe/Paris')).toBe('2026-03-29');
    expect(salesWindow({ days: 30, now: new Date('2026-03-31T10:00:00Z') }).startDay).toBe('2026-03-02');
    expect(salesWindow({ days: 90, now: NOW }).dayList.at(-1)).toBe('2026-11-09');
  });
});

describe('getSalesTotals', () => {
  it('additionne brut, commission réelle, net et économie vs stores sur 7 jours', async () => {
    const [eur, ...others] = await getSalesTotals('gam_a', { days: 7, now: NOW }, t);
    expect(eur).toEqual({
      currency: 'EUR',
      count: 3,
      grossCents: 3500,
      platformFeeCents: 175,
      netCents: 3325,
      savingsCents: 1050 - 175,
      avgCents: 1167,
    });
    // La devise étrangère est isolée, jamais additionnée à l'euro.
    expect(others).toEqual([expect.objectContaining({ currency: 'USD', count: 1, grossCents: 1200, platformFeeCents: 60, netCents: 1140 })]);
  });

  it('élargit la fenêtre à 30 puis 90 jours', async () => {
    const [d30] = await getSalesTotals('gam_a', { days: 30, now: NOW }, t);
    expect(d30.grossCents).toBe(3500 + 999);
    const [d90] = await getSalesTotals('gam_a', { days: 90, now: NOW }, t);
    expect(d90.grossCents).toBe(3500 + 999 + 300);
    expect(d90.count).toBe(5);
  });

  it('renvoie des totaux vides dans la devise du jeu sans vente', async () => {
    const [eur] = await getSalesTotals('gam_a', { days: 7, now: new Date('2025-01-01T00:00:00Z') }, t);
    expect(eur).toMatchObject({ currency: 'EUR', count: 0, grossCents: 0, avgCents: 0, savingsCents: 0 });
  });
});

describe('getDailyRevenue', () => {
  it('regroupe par jour de Paris et complète les jours vides', async () => {
    const days = await getDailyRevenue('gam_a', 'EUR', { days: 7, now: NOW }, t);
    expect(days.map((d) => d.day)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']);
    expect(days[0]).toEqual({ day: '2026-11-03', grossCents: 2000, count: 1 });
    expect(days[6]).toEqual({ day: '2026-11-09', grossCents: 1500, count: 2 });
    expect(days.reduce((s, d) => s + d.grossCents, 0)).toBe(3500);
  });
  it('filtre par devise', async () => {
    const usd = await getDailyRevenue('gam_a', 'USD', { days: 7, now: NOW }, t);
    expect(usd.find((d) => d.day === '2026-11-06')?.grossCents).toBe(1200);
    expect(usd.reduce((s, d) => s + d.grossCents, 0)).toBe(1200);
  });
  it('accepte un autre fuseau', async () => {
    const utc = await getDailyRevenue('gam_a', 'EUR', { days: 7, now: NOW, tz: 'UTC' }, t);
    expect(utc.find((d) => d.day === '2026-11-08')?.grossCents).toBe(500);
  });
});

describe('getTopItems / getTransactions', () => {
  it('classe les articles par revenu brut', async () => {
    const top = await getTopItems('gam_a', 'EUR', { days: 7, now: NOW }, t);
    expect(top.map((i) => [i.productId, i.count, i.grossCents])).toEqual([
      ['gems', 2, 3000],
      ['gold', 1, 500],
    ]);
  });
  it('liste les transactions payées et remboursées avec le statut de livraison', async () => {
    const tx = await getTransactions('gam_a', { days: 7, now: NOW }, t);
    expect(tx.map((x) => [x.amountCents, x.orderStatus, x.deliveryStatus])).toEqual([
      [1000, 'paid', 'acknowledged'],
      [500, 'paid', 'pending'],
      [1200, 'paid', 'failed'],
      [4000, 'refunded', 'acknowledged'],
      [2000, 'paid', 'delivered'],
    ]);
    expect(tx[0].date.toISOString()).toBe('2026-11-09T09:00:00.000Z');
    expect(await getTransactions('gam_a', { days: 7, now: NOW, limit: 2 }, t)).toHaveLength(2);
  });
  it('exporte un CSV échappé', async () => {
    const tx = await getTransactions('gam_a', { days: 7, now: NOW, limit: 1 }, t);
    const csv = transactionsToCsv([...tx, { ...tx[0], itemTitle: 'Pack "deluxe", x2', deliveryStatus: null }]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toMatch(/^date_utc,order_id,/);
    expect(lines[1]).toBe('2026-11-09T09:00:00.000Z,ord_t001,gems,Gemmes,#P1,1,10.00,0.50,9.50,EUR,paid,acknowledged');
    expect(lines[2]).toContain(',"Pack ""deluxe"", x2",');
    expect(lines[2].endsWith(',paid,')).toBe(true);
  });
});

describe('getPlayerPurchases', () => {
  it('renvoie l’historique du joueur, jeux joints, sans les commandes en attente', async () => {
    const { rows, total } = await getPlayerPurchases('usr_p', {}, t);
    expect(total).toBe(8);
    expect(rows[0]).toMatchObject({ amountCents: 7777, gameName: 'Jeu A', gameSlug: 'gam_a', deliveryStatus: null });
    expect(rows.some((r) => r.orderStatus === 'pending')).toBe(false);
    expect(rows.some((r) => r.gameId === 'gam_b')).toBe(false);
    const page = await getPlayerPurchases('usr_p', { limit: 3, offset: 3 }, t);
    expect(page.rows).toHaveLength(3);
    expect(page.rows[0].id).toBe(rows[3].id);
  });
});
