import { beforeAll, describe, expect, it, vi } from 'vitest';
import { db, studioMembers, user } from '@wolleen/db';
import { FX, insertPendingOrder, seedPaymentsFixtures } from '@/test/payments-fixtures';
import { getPayoutStudio, getPayoutStudios, getRecentStudioSales, getStudioRevenue } from './payouts';

vi.mock('@wolleen/db', async (importOriginal) => {
  const { createTestDb } = await import('@wolleen/db/testing');
  (globalThis as { __wolleenDb?: unknown }).__wolleenDb = await createTestDb();
  return importOriginal();
});

beforeAll(async () => {
  await seedPaymentsFixtures();
  await db.insert(user).values([
    { id: 'usr_owner', name: 'Owner', email: 'owner@wolleen.test' },
    { id: 'usr_finance', name: 'Finance', email: 'finance@wolleen.test' },
    { id: 'usr_dev', name: 'Dev', email: 'dev@wolleen.test' },
  ]);
  await db.insert(studioMembers).values([
    { studioId: FX.studio, userId: 'usr_owner', role: 'owner' },
    { studioId: FX.studio, userId: 'usr_finance', role: 'finance' },
    { studioId: FX.studio, userId: 'usr_dev', role: 'developer' },
  ]);
});

describe('accès aux versements', () => {
  it('réservé aux rôles owner et finance', async () => {
    expect((await getPayoutStudios('usr_owner')).map((s) => s.id)).toEqual([FX.studio]);
    expect((await getPayoutStudio('usr_finance', FX.studio))?.role).toBe('finance');
    expect(await getPayoutStudios('usr_dev')).toEqual([]);
    expect(await getPayoutStudio('usr_dev', FX.studio)).toBeNull();
    expect(await getPayoutStudio(FX.buyer.id, FX.studio)).toBeNull();
  });
});

describe('revenus du studio', () => {
  it('ne compte que les commandes payées : brut, commission, net', async () => {
    await insertPendingOrder({ status: 'paid', paidAt: new Date(), amountCents: 799, platformFeeCents: 40 });
    await insertPendingOrder({ status: 'paid', paidAt: new Date(), amountCents: 3999, platformFeeCents: 200, stripePaymentIntentId: 'pi_1' });
    await insertPendingOrder({ status: 'pending' });
    await insertPendingOrder({ status: 'failed' });
    expect(await getStudioRevenue(FX.studio)).toEqual([{ currency: 'EUR', orders: 2, grossCents: 4798, feeCents: 240, netCents: 4558 }]);
    const sales = await getRecentStudioSales(FX.studio);
    expect(sales).toHaveLength(2);
    expect(sales.filter((s) => s.paymentIntentId === null)).toHaveLength(1); // vente simulée
  });
});
