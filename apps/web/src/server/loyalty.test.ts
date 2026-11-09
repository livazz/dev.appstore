import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@devappstore/core';
import { db, eq, gameLinks, loyaltyEntries, loyaltyRedemptions, loyaltyRewards, orders, sql, user } from '@devappstore/db';
import { FX, insertPendingOrder, seedPaymentsFixtures } from '@/test/payments-fixtures';
import { addDays } from './loyalty-logic';
import {
  applyDiscountVoucher,
  awardPointsForOrder,
  ensureBonusDeliveries,
  expirePoints,
  getBalance,
  getLoyaltyOverview,
  listHistory,
  listRewards,
  previewDiscountVoucher,
  redeemReward,
  releaseDiscountVoucher,
  revokePointsForOrder,
} from './loyalty';

// Base en mémoire à la place de .data/pglite.
vi.mock('@devappstore/db', async (importOriginal) => {
  const { createTestDb } = await import('@devappstore/db/testing');
  (globalThis as { __devAppStoreDb?: unknown }).__devAppStoreDb = await createTestDb();
  return importOriginal();
});

// Contrat delivery : on vérifie l'appel, pas l'envoi au jeu.
const delivery = vi.hoisted(() => ({ enqueueDelivery: vi.fn(async (orderId: string) => `dlv_${orderId}`) }));
vi.mock('@/server/delivery', () => delivery);

const T0 = new Date('2026-03-01T12:00:00Z');
let userSeq = 0;

/** Utilisateur neuf par test (soldes indépendants), lié au jeu de test. */
async function newPlayer(opts: { linked?: boolean } = {}) {
  const id = `usr_loy_${++userSeq}`;
  await db.insert(user).values({ id, name: `Joueur ${userSeq}`, email: `loy${userSeq}@devappstore.test` });
  if (opts.linked !== false) {
    await db.insert(gameLinks).values({ id: newId('lnk'), userId: id, gameId: FX.game.id, playerId: `P-${userSeq}`, method: 'code', verified: 1 });
  }
  return id;
}

/** Commande payée de `userId` avec la commission donnée. */
async function paidOrder(userId: string, platformFeeCents: number, amountCents = 4000) {
  return insertPendingOrder({ userId, status: 'paid', paidAt: T0, amountCents, platformFeeCents });
}

async function rewardDiscount(overrides: Partial<typeof loyaltyRewards.$inferInsert> = {}) {
  const id = newId('lrw');
  await db.insert(loyaltyRewards).values({ id, kind: 'discount', title: '1 € de réduction', pointsCost: 50, valueCents: 100, ...overrides });
  return id;
}

async function rewardBonus(overrides: Partial<typeof loyaltyRewards.$inferInsert> = {}) {
  const id = newId('lrw');
  await db.insert(loyaltyRewards).values({ id, kind: 'bonus_item', title: 'Gemmes offertes', pointsCost: 20, gameId: FX.game.id, itemId: FX.item, ...overrides });
  return id;
}

/** Donne `points` à l'utilisateur via une commande payée (commission = points × 10 c). */
async function givePoints(userId: string, points: number, now = T0) {
  const o = await paidOrder(userId, points * 10);
  const r = await awardPointsForOrder(o.id, { now });
  expect(r.status).toBe('awarded');
  return o;
}

beforeAll(async () => {
  await seedPaymentsFixtures();
});

beforeEach(() => {
  vi.stubEnv('LOYALTY_ENABLED', '1');
  delivery.enqueueDelivery.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('awardPointsForOrder', () => {
  it('attribue ⌊commission / 10 c⌋ points, avec expiration à 12 mois', async () => {
    const u = await newPlayer();
    const o = await paidOrder(u, 400);
    expect(await awardPointsForOrder(o.id, { now: T0 })).toMatchObject({ status: 'awarded', points: 40 });
    const [e] = await db.select().from(loyaltyEntries).where(eq(loyaltyEntries.orderId, o.id));
    expect(e).toMatchObject({ userId: u, delta: 40, reason: 'order_award' });
    expect(e!.expiresAt!.toISOString()).toBe(addDays(T0, 365).toISOString());
    expect(await getBalance(u, { now: T0 })).toBe(40);
  });

  it('est idempotent, y compris en concurrence', async () => {
    const u = await newPlayer();
    const o = await paidOrder(u, 250);
    const results = await Promise.all([1, 2, 3, 4].map(() => awardPointsForOrder(o.id, { now: T0 })));
    expect(results.filter((r) => r.status === 'awarded')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'already_awarded')).toHaveLength(3);
    expect(await awardPointsForOrder(o.id, { now: T0 })).toMatchObject({ status: 'already_awarded', points: 25 });
    expect(await getBalance(u, { now: T0 })).toBe(25);
  });

  it('ignore les commandes non payées, sans commission ou inconnues', async () => {
    const u = await newPlayer();
    const pending = await insertPendingOrder({ userId: u, platformFeeCents: 400 });
    expect(await awardPointsForOrder(pending.id)).toMatchObject({ status: 'skipped', reason: 'not_paid' });
    const tiny = await paidOrder(u, 9);
    expect(await awardPointsForOrder(tiny.id)).toMatchObject({ status: 'skipped', reason: 'no_points' });
    expect(await awardPointsForOrder('ord_inconnue')).toMatchObject({ status: 'skipped', reason: 'order_not_found' });
    expect(await getBalance(u)).toBe(0);
  });

  it('ne fait rien quand le programme est désactivé', async () => {
    vi.stubEnv('LOYALTY_ENABLED', '0');
    const u = await newPlayer();
    const o = await paidOrder(u, 400);
    expect(await awardPointsForOrder(o.id)).toMatchObject({ status: 'skipped', reason: 'disabled' });
    expect(await getBalance(u)).toBe(0);
  });
});

describe('expiration', () => {
  it('le solde exclut les lots expirés, avant même le passage du job', async () => {
    const u = await newPlayer();
    await givePoints(u, 30, T0);
    await givePoints(u, 10, addDays(T0, 200));
    expect(await getBalance(u, { now: addDays(T0, 364) })).toBe(40);
    expect(await getBalance(u, { now: addDays(T0, 365) })).toBe(10);
    expect(await getBalance(u, { now: addDays(T0, 600) })).toBe(0);
  });

  it('expirePoints inscrit une écriture par lot expiré, une seule fois', async () => {
    const u = await newPlayer();
    await givePoints(u, 30, T0);
    await givePoints(u, 10, addDays(T0, 200));
    const now = addDays(T0, 400);
    const first = await expirePoints({ now, userId: u });
    expect(first).toMatchObject({ entries: 1, points: 30 });
    expect(await expirePoints({ now, userId: u })).toMatchObject({ entries: 0, points: 0 });
    expect(await getBalance(u, { now })).toBe(10);
    const { rows } = await listHistory(u);
    // Plus récents d'abord : l'expiration est datée du jour d'expiration du lot (J+365).
    expect(rows.map((r) => [r.reason, r.delta])).toEqual([
      ['expiry', -30],
      ['order_award', 10],
      ['order_award', 30],
    ]);
  });

  it('expirePoints sans utilisateur traite tous les comptes concernés', async () => {
    const u = await newPlayer();
    await givePoints(u, 15, T0);
    const r = await expirePoints({ now: addDays(T0, 366) });
    expect(r.entries).toBeGreaterThanOrEqual(1);
    const rows = await db.select().from(loyaltyEntries).where(eq(loyaltyEntries.userId, u));
    expect(rows.find((e) => e.reason === 'expiry')?.delta).toBe(-15);
  });

  it('signale les points qui expirent dans les 30 jours', async () => {
    const u = await newPlayer();
    await givePoints(u, 12, T0);
    const ov = await getLoyaltyOverview(u, { now: addDays(T0, 350) });
    expect(ov.balance).toBe(12);
    expect(ov.expiringSoon).toEqual([{ points: 12, expiresAt: addDays(T0, 365) }]);
  });
});

describe('revokePointsForOrder', () => {
  it('reprend les points de la commande remboursée, une seule fois', async () => {
    const u = await newPlayer();
    const o = await givePoints(u, 40);
    await givePoints(u, 10);
    expect(await revokePointsForOrder(o.id, { now: addDays(T0, 1) })).toMatchObject({ status: 'revoked', points: 40, awarded: 40 });
    expect(await revokePointsForOrder(o.id, { now: addDays(T0, 1) })).toMatchObject({ status: 'already_revoked', points: 40 });
    expect(await getBalance(u, { now: addDays(T0, 1) })).toBe(10);
  });

  it('ne rend jamais le solde négatif si les points ont déjà été dépensés', async () => {
    const u = await newPlayer();
    const o = await givePoints(u, 60);
    const reward = await rewardDiscount();
    expect(await redeemReward(u, reward, { now: addDays(T0, 1) })).toMatchObject({ ok: true, balance: 10 });
    expect(await revokePointsForOrder(o.id, { now: addDays(T0, 2) })).toMatchObject({ status: 'revoked', points: 10, awarded: 60 });
    expect(await getBalance(u, { now: addDays(T0, 2) })).toBe(0);
    const [{ total }] = (await db.execute(sql`select coalesce(sum(delta), 0)::int as total from loyalty_entries where user_id = ${u}`)).rows as { total: number }[];
    expect(total).toBe(0);
  });

  it('un remboursement avant attribution bloque l’attribution ultérieure', async () => {
    const u = await newPlayer();
    const o = await paidOrder(u, 300);
    expect(await revokePointsForOrder(o.id)).toMatchObject({ status: 'revoked', points: 0 });
    expect(await awardPointsForOrder(o.id)).toMatchObject({ status: 'skipped', reason: 'revoked' });
    expect(await getBalance(u)).toBe(0);
  });

  it('ne reprend pas les points déjà expirés de cette commande', async () => {
    const u = await newPlayer();
    const o = await givePoints(u, 20, T0);
    await givePoints(u, 50, addDays(T0, 300));
    expect(await revokePointsForOrder(o.id, { now: addDays(T0, 400) })).toMatchObject({ status: 'revoked', points: 0 });
    expect(await getBalance(u, { now: addDays(T0, 400) })).toBe(50);
  });
});

describe('redeemReward', () => {
  it('bon de réduction : débite les points et émet un bon valable 90 jours', async () => {
    const u = await newPlayer();
    await givePoints(u, 70);
    const reward = await rewardDiscount();
    const r = await redeemReward(u, reward, { now: T0 });
    expect(r).toMatchObject({ ok: true, kind: 'discount', pointsSpent: 50, balance: 20, orderId: null });
    expect(await getBalance(u, { now: T0 })).toBe(20);
    const ov = await getLoyaltyOverview(u, { now: T0 });
    expect(ov.vouchers).toHaveLength(1);
    expect(ov.vouchers[0]!.expiresAt!.toISOString()).toBe(addDays(T0, 90).toISOString());
    const { rows } = await listHistory(u);
    expect(rows[0]).toMatchObject({ reason: 'redemption', delta: -50, redemptionTitle: '1 € de réduction' });
  });

  it('refuse sans assez de points, sans rien écrire', async () => {
    const u = await newPlayer();
    await givePoints(u, 49);
    const reward = await rewardDiscount();
    expect(await redeemReward(u, reward, { now: T0 })).toMatchObject({ ok: false, code: 'insufficient_points' });
    expect(await getBalance(u, { now: T0 })).toBe(49);
    expect(await db.select().from(loyaltyRedemptions).where(eq(loyaltyRedemptions.userId, u))).toHaveLength(0);
    const [rw] = await db.select().from(loyaltyRewards).where(eq(loyaltyRewards.id, reward));
    expect(rw!.redeemedCount).toBe(0);
  });

  it('refuse une récompense hors budget (trop généreuse), inactive ou hors période', async () => {
    const u = await newPlayer();
    await givePoints(u, 500);
    const tooGenerous = await rewardDiscount({ pointsCost: 10, valueCents: 100 });
    const inactive = await rewardDiscount({ active: false });
    const future = await rewardDiscount({ startsAt: addDays(T0, 10) });
    for (const id of [tooGenerous, inactive, future, 'lrw_inconnue']) {
      expect(await redeemReward(u, id, { now: T0 })).toMatchObject({ ok: false, code: 'reward_unavailable' });
    }
    expect(await getBalance(u, { now: T0 })).toBe(500);
  });

  it('les points expirés ne peuvent pas être dépensés', async () => {
    const u = await newPlayer();
    await givePoints(u, 60, T0);
    const reward = await rewardDiscount();
    expect(await redeemReward(u, reward, { now: addDays(T0, 366) })).toMatchObject({ ok: false, code: 'insufficient_points' });
  });

  // NB : PGlite exécute les transactions l'une après l'autre. Ces tests vérifient le résultat logique des rachats
  // simultanés ; sur Postgres, c'est le verrou pg_advisory_xact_lock par utilisateur (et l'UPDATE conditionnel du
  // stock) qui garantit la même chose entre connexions.
  it('concurrence : deux rachats simultanés ne dépensent pas deux fois les mêmes points', async () => {
    const u = await newPlayer();
    await givePoints(u, 120);
    const reward = await rewardDiscount({ pointsCost: 100, valueCents: 200 });
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => redeemReward(u, reward, { now: T0 })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === 'insufficient_points')).toHaveLength(4);
    expect(await getBalance(u, { now: T0 })).toBe(20);
  });

  it('concurrence : le stock n’est jamais dépassé', async () => {
    const reward = await rewardDiscount({ stock: 2 });
    const players = await Promise.all([1, 2, 3, 4].map(() => newPlayer()));
    for (const p of players) await givePoints(p, 50);
    const results = await Promise.all(players.map((p) => redeemReward(p, reward, { now: T0 })));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok && r.code === 'out_of_stock')).toHaveLength(2);
    const [rw] = await db.select().from(loyaltyRewards).where(eq(loyaltyRewards.id, reward));
    expect(rw!.redeemedCount).toBe(2);
    // Les joueurs refusés gardent leurs points.
    const balances = await Promise.all(players.map((p) => getBalance(p, { now: T0 })));
    expect(balances.sort()).toEqual([0, 0, 50, 50]);
  });

  it('respecte la limite par joueur', async () => {
    const u = await newPlayer();
    await givePoints(u, 200);
    const reward = await rewardDiscount({ perUserLimit: 1 });
    expect((await redeemReward(u, reward, { now: T0 })).ok).toBe(true);
    expect(await redeemReward(u, reward, { now: T0 })).toMatchObject({ ok: false, code: 'limit_reached' });
    expect(await getBalance(u, { now: T0 })).toBe(150);
  });

  it('objet bonus : commande à 0 € payée et livrée au jeu, sans points attribués', async () => {
    const u = await newPlayer();
    await givePoints(u, 30);
    const reward = await rewardBonus();
    const r = await redeemReward(u, reward, { now: T0 });
    expect(r).toMatchObject({ ok: true, kind: 'bonus_item', pointsSpent: 20, balance: 10 });
    if (!r.ok) throw new Error('rachat refusé');
    const [o] = await db.select().from(orders).where(eq(orders.id, r.orderId!));
    expect(o).toMatchObject({ userId: u, gameId: FX.game.id, itemId: FX.item, amountCents: 0, platformFeeCents: 0, status: 'paid', playerId: `P-${userSeq}` });
    expect(delivery.enqueueDelivery).toHaveBeenCalledWith(r.orderId);
    expect(await awardPointsForOrder(r.orderId!)).toMatchObject({ status: 'skipped', reason: 'no_points' });
  });

  it('objet bonus : exige un compte de jeu lié', async () => {
    const u = await newPlayer({ linked: false });
    await givePoints(u, 30);
    const reward = await rewardBonus();
    expect(await redeemReward(u, reward, { now: T0 })).toMatchObject({ ok: false, code: 'not_linked' });
    expect(await getBalance(u, { now: T0 })).toBe(30);
  });

  it('objet bonus : un échec de livraison n’annule pas le rachat et se rattrape', async () => {
    const u = await newPlayer();
    await givePoints(u, 30);
    const reward = await rewardBonus();
    delivery.enqueueDelivery.mockRejectedValueOnce(new Error('panne'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await redeemReward(u, reward, { now: T0 });
    spy.mockRestore();
    expect(r.ok).toBe(true);
    // Le faux enqueueDelivery n'insère pas de livraison : ensureBonusDeliveries réessaie toutes les commandes bonus sans livraison.
    delivery.enqueueDelivery.mockClear();
    await ensureBonusDeliveries();
    expect(delivery.enqueueDelivery).toHaveBeenCalledWith(r.ok ? r.orderId : '');
  });

  it('refusé quand le programme est désactivé', async () => {
    const u = await newPlayer();
    await givePoints(u, 60);
    const reward = await rewardDiscount();
    vi.stubEnv('LOYALTY_ENABLED', 'false');
    expect(await redeemReward(u, reward)).toMatchObject({ ok: false, code: 'disabled' });
  });
});

describe('listRewards', () => {
  it('indique ce qui bloque chaque récompense', async () => {
    await db.update(loyaltyRewards).set({ active: false });
    const u = await newPlayer({ linked: false });
    await givePoints(u, 60);
    const cheap = await rewardDiscount({ title: 'A', position: 1 });
    const expensive = await rewardDiscount({ title: 'B', pointsCost: 100, valueCents: 100, position: 2 });
    const bonus = await rewardBonus({ title: 'C', position: 3 });
    await rewardDiscount({ title: 'hors budget', pointsCost: 1, valueCents: 100 });
    const list = await listRewards(u, { now: T0 });
    expect(list.map((r) => [r.id, r.blocked])).toEqual([
      [cheap, null],
      [expensive, 'insufficient_points'],
      [bonus, 'not_linked'],
    ]);
    expect(list[2]!.game).toMatchObject({ id: FX.game.id, slug: FX.game.slug });
  });
});

describe('bons de réduction', () => {
  async function voucherFor(u: string) {
    await givePoints(u, 50);
    const r = await redeemReward(u, await rewardDiscount(), { now: T0 });
    if (!r.ok) throw new Error(r.message);
    return r.redemptionId;
  }

  it('réduction plafonnée à la commission de la commande', async () => {
    const u = await newPlayer();
    const v = await voucherFor(u);
    expect(await previewDiscountVoucher(u, v, { amountCents: 799, platformFeeCents: 40, currency: 'EUR' }, { now: T0 })).toMatchObject({
      ok: false,
      code: 'order_too_small',
    });
    expect(await previewDiscountVoucher(u, v, { amountCents: 2000, platformFeeCents: 100, currency: 'USD' }, { now: T0 })).toMatchObject({
      ok: false,
      code: 'currency_mismatch',
    });
    expect(await previewDiscountVoucher(u, v, { amountCents: 2000, platformFeeCents: 100, currency: 'EUR' }, { now: T0 })).toEqual({ ok: true, discountCents: 100 });
    expect(await previewDiscountVoucher('usr_autre', v, { amountCents: 2000, platformFeeCents: 100, currency: 'EUR' }, { now: T0 })).toMatchObject({ ok: false });
  });

  it('utilisable une seule fois, libéré si la commande échoue, expiré après 90 jours', async () => {
    const u = await newPlayer();
    const v = await voucherFor(u);
    const amounts = { amountCents: 2000, platformFeeCents: 100, currency: 'EUR' as const };
    const o1 = await insertPendingOrder({ userId: u, amountCents: 1900, platformFeeCents: 0 });
    const o2 = await insertPendingOrder({ userId: u, amountCents: 1900, platformFeeCents: 0 });
    const [a, b] = await Promise.all([applyDiscountVoucher(u, v, o1.id, amounts, { now: T0 }), applyDiscountVoucher(u, v, o2.id, amounts, { now: T0 })]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const usedOn = a.ok ? o1.id : o2.id;
    await db.update(orders).set({ status: 'failed' }).where(eq(orders.id, usedOn));
    expect(await releaseDiscountVoucher(usedOn)).toBe(true);
    expect(await applyDiscountVoucher(u, v, o1.id, amounts, { now: T0 })).toEqual({ ok: true, discountCents: 100 });
    await db.update(orders).set({ status: 'paid' }).where(eq(orders.id, o1.id));
    expect(await releaseDiscountVoucher(o1.id)).toBe(false);

    const v2 = await voucherFor(u);
    expect(await previewDiscountVoucher(u, v2, amounts, { now: addDays(T0, 91) })).toMatchObject({ ok: false, code: 'voucher_unavailable' });
    await expirePoints({ now: addDays(T0, 91), userId: u });
    const [row] = await db.select().from(loyaltyRedemptions).where(eq(loyaltyRedemptions.id, v2));
    expect(row!.status).toBe('expired');
  });
});
