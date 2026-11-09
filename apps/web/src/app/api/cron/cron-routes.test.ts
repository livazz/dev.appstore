import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cronGuard, isCronAuthorized } from '@/server/delivery-http';

/*
 * Tâches planifiées : les quatre routes partagent la même garde CRON_SECRET (temps constant, 503 sans secret hors
 * développement) et sont toutes déclarées dans vercel.json.
 */

vi.mock('@devappstore/db', async (importOriginal) => {
  const { createTestDb } = await import('@devappstore/db/testing');
  (globalThis as { __devAppStoreDb?: unknown }).__devAppStoreDb = await createTestDb();
  return importOriginal();
});

const SECRET = 'cron-secret-de-test-0123456789';
const req = (path: string, auth?: string) => new Request(`http://localhost${path}`, { headers: auth ? { authorization: auth } : {} });

type Handler = (r: Request) => Promise<Response>;
const routes: Record<string, Handler> = {};

beforeAll(async () => {
  routes['/api/cron/deliveries'] = (await import('./deliveries/route')).GET;
  routes['/api/cron/loyalty'] = (await import('./loyalty/route')).GET;
  routes['/api/cron/weekly-reports'] = (await import('./weekly-reports/route')).GET;
  routes['/api/checkout/expire'] = (await import('../checkout/expire/route')).GET;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('cronGuard', () => {
  it('sans CRON_SECRET : 503 hors développement, accepté en développement', () => {
    expect(cronGuard(req('/x'), undefined, 'production')?.status).toBe(503);
    expect(cronGuard(req('/x'), undefined, 'test')?.status).toBe(503);
    expect(cronGuard(req('/x'), undefined, 'development')).toBeNull();
    expect(isCronAuthorized(req('/x'), undefined, 'test')).toBe(false);
  });

  it('avec CRON_SECRET : jeton exact exigé (401 sinon)', () => {
    expect(cronGuard(req('/x', `Bearer ${SECRET}`), SECRET, 'production')).toBeNull();
    for (const bad of [undefined, 'Bearer ', `Bearer ${SECRET}x`, `bearer ${SECRET}`, SECRET]) {
      expect(cronGuard(req('/x', bad), SECRET, 'production')?.status).toBe(401);
    }
  });
});

describe('routes cron', () => {
  it.each(['/api/cron/deliveries', '/api/cron/loyalty', '/api/cron/weekly-reports', '/api/checkout/expire'])(
    '%s : 503 sans secret, 401 avec un mauvais jeton, 200 avec le bon',
    async (path) => {
      vi.stubEnv('CRON_SECRET', '');
      expect((await routes[path]!(req(path))).status).toBe(503);
      vi.stubEnv('CRON_SECRET', SECRET);
      expect((await routes[path]!(req(path, 'Bearer faux'))).status).toBe(401);
      const ok = await routes[path]!(req(path, `Bearer ${SECRET}`));
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ ok: true });
    },
  );

  it('/api/cron/loyalty renvoie le bilan des expirations et des objets bonus rattrapés', async () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    const body = await (await routes['/api/cron/loyalty']!(req('/api/cron/loyalty', `Bearer ${SECRET}`))).json();
    expect(body).toEqual({ ok: true, expired: { users: 0, entries: 0, points: 0 }, bonusDeliveries: 0 });
  });

  it('vercel.json planifie les quatre routes', async () => {
    const { readFile } = await import('node:fs/promises');
    const cfg = JSON.parse(await readFile(new URL('../../../../vercel.json', import.meta.url), 'utf8')) as { crons: { path: string; schedule: string }[] };
    expect(cfg.crons.map((c) => c.path).sort()).toEqual(['/api/checkout/expire', '/api/cron/deliveries', '/api/cron/loyalty', '/api/cron/weekly-reports']);
    expect(cfg.crons.find((c) => c.path === '/api/cron/weekly-reports')?.schedule).toBe('0 6 * * 1');
  });
});
