import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PENDING_ORDER_TTL_MS } from '@/server/payments';
import { getOrder, insertPendingOrder, seedPaymentsFixtures } from '@/test/payments-fixtures';
import { GET } from './route';

vi.mock('@devappstore/db', async (importOriginal) => {
  const { createTestDb } = await import('@devappstore/db/testing');
  (globalThis as { __devAppStoreDb?: unknown }).__devAppStoreDb = await createTestDb();
  return importOriginal();
});

vi.mock('@/server/delivery', () => ({ enqueueDelivery: vi.fn(async () => 'dlv_x') }));

const call = (auth?: string) =>
  GET(new Request('http://localhost/api/checkout/expire', { headers: auth ? { authorization: auth } : {} }));

beforeAll(async () => {
  await seedPaymentsFixtures();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/checkout/expire', () => {
  it('CRON_SECRET vide → 503, rien n’est modifié', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const o = await insertPendingOrder({ createdAt: new Date(Date.now() - PENDING_ORDER_TTL_MS - 60_000) });
    expect((await call()).status).toBe(503);
    expect((await call('Bearer ')).status).toBe(503);
    expect((await getOrder(o.id))?.status).toBe('pending');
  });

  it('secret absent ou faux → 401', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret-test');
    expect((await call()).status).toBe(401);
    expect((await call('Bearer undefined')).status).toBe(401);
    expect((await call('Bearer cron-secret-tesT')).status).toBe(401);
  });

  it('secret valide → expire les pending de plus de 24 h', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret-test');
    const stale = await insertPendingOrder({ createdAt: new Date(Date.now() - PENDING_ORDER_TTL_MS - 60_000) });
    const fresh = await insertPendingOrder();
    const res = await call('Bearer cron-secret-test');
    expect(res.status).toBe(200);
    expect((await res.json()).expired).toBeGreaterThanOrEqual(1);
    expect((await getOrder(stale.id))?.status).toBe('failed');
    expect((await getOrder(fresh.id))?.status).toBe('pending');
  });
});
