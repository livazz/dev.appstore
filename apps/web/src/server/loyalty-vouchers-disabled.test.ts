/*
 * Revue de sécurité 2026-11, C-6 : les bons de réduction ne sont pas encore appliqués au checkout. Tant que
 * DISCOUNT_VOUCHERS_ENABLED est faux (valeur réelle, non simulée ici), une récompense `discount` n'est ni proposée ni
 * rachetable : aucun point n'est débité contre un bon inutilisable.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { newId } from '@devappstore/core';
import { db, gameLinks, loyaltyRedemptions, loyaltyRewards, eq, user } from '@devappstore/db';
import { FX, insertPendingOrder, seedPaymentsFixtures } from '@/test/payments-fixtures';
import { DISCOUNT_VOUCHERS_ENABLED } from './loyalty-logic';
import { awardPointsForOrder, getBalance, listRewards, redeemReward } from './loyalty';

vi.mock('@devappstore/db', async (importOriginal) => {
  const { createTestDb } = await import('@devappstore/db/testing');
  (globalThis as { __devAppStoreDb?: unknown }).__devAppStoreDb = await createTestDb();
  return importOriginal();
});
vi.mock('@/server/delivery', () => ({ enqueueDelivery: vi.fn(async (orderId: string) => `dlv_${orderId}`) }));

beforeAll(async () => {
  await seedPaymentsFixtures();
}, 60_000);

describe('bons de réduction non branchés au checkout (C-6)', () => {
  it('le drapeau est désactivé', () => {
    expect(DISCOUNT_VOUCHERS_ENABLED).toBe(false);
  });

  it('récompense discount : ni proposée, ni rachetable, aucun point débité ni bon émis', async () => {
    const u = 'usr_vouchers';
    await db.insert(user).values({ id: u, name: 'Bons', email: 'bons@devappstore.test' });
    await db.insert(gameLinks).values({ id: newId('lnk'), userId: u, gameId: FX.game.id, playerId: 'P-bons', method: 'code', verified: 1 });
    const o = await insertPendingOrder({ userId: u, status: 'paid', paidAt: new Date(), amountCents: 4000, platformFeeCents: 1000 });
    expect(await awardPointsForOrder(o.id)).toMatchObject({ status: 'awarded', points: 100 });

    const discount = newId('lrw');
    await db.insert(loyaltyRewards).values({ id: discount, kind: 'discount', title: '1 € de réduction', pointsCost: 50, valueCents: 100 });
    const bonus = newId('lrw');
    await db.insert(loyaltyRewards).values({ id: bonus, kind: 'bonus_item', title: 'Gemmes', pointsCost: 20, gameId: FX.game.id, itemId: FX.item });

    const listed = (await listRewards(u)).map((r) => r.id);
    expect(listed).not.toContain(discount);
    expect(listed).toContain(bonus);
    expect(await redeemReward(u, discount)).toMatchObject({ ok: false, code: 'reward_unavailable' });
    expect(await getBalance(u)).toBe(100);
    expect(await db.select().from(loyaltyRedemptions).where(eq(loyaltyRedemptions.userId, u))).toHaveLength(0);
  });
});
