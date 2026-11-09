/*
 * Limitation de débit de l'API v1 (int/security) : par IP (avant authentification) et par clé, limites propres à
 * link-codes / link-requests, plafond de flux SSE simultanés par joueur et durée maximale d'un flux.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, hashApiKey } from '@devappstore/core';
import type { DB } from '@devappstore/db';

vi.mock('server-only', () => ({}));
vi.mock('@devappstore/db', async () => {
  const schema = await import('@devappstore/db/schema');
  const orm = await import('drizzle-orm');
  const { createTestDb } = await import('@devappstore/db/testing');
  return { ...schema, schema, ...orm, db: await createTestDb() };
});

const D = await import('@devappstore/db');
const db = D.db as DB;
const RL = await import('@/server/rate-limit');
const G = await import('@/server/api-rate-limit');
const linkCodesRoute = await import('./link-codes/route');
const linkRequestsRoute = await import('./link-requests/[id]/route');
const streamRoute = await import('./deliveries/stream/route');

const SECRET = 'das_secret_rl_game';
const PUB = 'das_pub_rl_game';

type Init = { method?: string; key?: string; ip?: string; body?: unknown; signal?: AbortSignal };
function req(path: string, init: Init = {}) {
  const headers: Record<string, string> = {};
  if (init.key) headers.authorization = `Bearer ${init.key}`;
  if (init.ip) headers['x-forwarded-for'] = `${init.ip}, 10.0.0.1`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`http://devappstore.test${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  await db.insert(D.studios).values({ id: 'std_rl', name: 'RL', slug: 'rl' });
  await db.insert(D.games).values({
    id: 'gam_rl', studioId: 'std_rl', slug: 'gam_rl', name: 'RL', theme: DEFAULT_THEME, status: 'live', linkMethods: ['code'],
    webhookSecret: 'whsec_rl', apiKeyHash: hashApiKey(SECRET), apiKeyPrefix: SECRET.slice(0, 14), publishableKey: PUB,
  });
}, 60_000);

afterEach(async () => {
  await RL.getRateLimitStore().reset();
});

describe('limitation de débit /api/v1', () => {
  it('link-codes : plafond par IP (429 + Retry-After + CORS), les autres IP ne sont pas touchées', async () => {
    const max = G.API_RATE_LIMITS.routes['link-codes']!.perIp.max;
    const post = (ip: string, i: number) =>
      linkCodesRoute.POST(req('/api/v1/link-codes', { method: 'POST', key: PUB, ip, body: { player_id: `p-${ip}-${i}` } }));
    for (let i = 0; i < max; i++) expect((await post('203.0.113.7', i)).status).toBe(200);
    const res = await post('203.0.113.7', max);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('rate_limited');
    expect((await post('198.51.100.9', 0)).status).toBe(200);
  });

  it('link-requests : les clés invalides comptent aussi pour l’IP (frein à l’essai de clés)', async () => {
    const max = G.API_RATE_LIMITS.routes['link-requests']!.perIp.max;
    for (let i = 0; i < max; i++) {
      expect((await linkRequestsRoute.GET(req('/api/v1/link-requests/lnc_x', { key: `das_pub_faux${i}`, ip: '192.0.2.50' }), params('lnc_x'))).status).toBe(401);
    }
    const blocked = await linkRequestsRoute.GET(req('/api/v1/link-requests/lnc_x', { key: PUB, ip: '192.0.2.50' }), params('lnc_x'));
    expect(blocked.status).toBe(429);
    expect((await linkRequestsRoute.GET(req('/api/v1/link-requests/lnc_x', { key: PUB, ip: '192.0.2.51' }), params('lnc_x'))).status).toBe(404);
  });

  it('plafond par clé, quelle que soit l’IP (clé publique partagée par les clients du jeu)', async () => {
    const store = new RL.MemoryRateLimitStore();
    const auth = { kind: 'publishable' as const, game: { id: 'gam_rl' } as never, player: null };
    const deps = { store, now: 1_800_000_000_000, authenticate: async () => auth };
    const max = G.API_RATE_LIMITS.routes['link-codes']!.perKey.max;
    for (let i = 0; i < max; i++) {
      const r = await G.guardApi(req('/', { ip: `10.1.${Math.floor(i / 250)}.${i % 250}` }), 'link-codes', deps);
      expect(r.ok).toBe(true);
    }
    const r = await G.guardApi(req('/', { ip: '10.9.9.9' }), 'link-codes', deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.res.status).toBe(429);
    // Une autre route reste ouverte (plafond global de la clé non atteint).
    expect((await G.guardApi(req('/', { ip: '10.9.9.9' }), 'deliveries', deps)).ok).toBe(true);
    // La clé secrète du même jeu a son propre compteur.
    const secretDeps = { ...deps, authenticate: async () => ({ kind: 'secret' as const, game: { id: 'gam_rl' } as never }) };
    expect((await G.guardApi(req('/', { ip: '10.9.9.9' }), 'link-codes', secretDeps)).ok).toBe(true);
  });
});

describe('flux SSE : connexions simultanées et durée maximale', () => {
  const open = (playerId: string, ctrl: AbortController, ip = '203.0.113.20') =>
    streamRoute.GET(req(`/api/v1/deliveries/stream?player_id=${playerId}`, { key: SECRET, ip, signal: ctrl.signal }));

  it('plafond de flux simultanés par joueur ; une place se libère à la fermeture', async () => {
    const ctrls = Array.from({ length: G.STREAM_LIMITS.perPlayer }, () => new AbortController());
    const opened = [];
    for (const c of ctrls) {
      const res = await open('P_many', c);
      expect(res.status).toBe(200);
      opened.push(res);
    }
    const extra = await open('P_many', new AbortController());
    expect(extra.status).toBe(429);
    expect(((await extra.json()) as { error: { code: string } }).error.code).toBe('too_many_streams');
    expect(extra.headers.get('access-control-allow-origin')).toBe('*');
    // Un autre joueur du même jeu n'est pas concerné.
    const other = new AbortController();
    expect((await open('P_other', other)).status).toBe(200);
    other.abort();

    ctrls[0]!.abort();
    await new Promise((r) => setTimeout(r, 10));
    const again = new AbortController();
    expect((await open('P_many', again)).status).toBe(200);
    again.abort();
    for (const c of ctrls) c.abort();
    await new Promise((r) => setTimeout(r, 10));
    expect(RL.getStreamSlots().active('stream:player:gam_rl:P_many')).toBe(0);
    expect(RL.getStreamSlots().active('stream:key:secret:gam_rl')).toBe(0);
  });

  it('le serveur ferme le flux après la durée maximale et libère la place', async () => {
    const saved = G.STREAM_LIMITS.maxDurationMs;
    G.STREAM_LIMITS.maxDurationMs = 150;
    try {
      const res = await open('P_long', new AbortController());
      expect(res.status).toBe(200);
      const reader = res.body!.getReader();
      const started = Date.now();
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        if (Date.now() - started > 5000) throw new Error('flux jamais fermé');
      }
      expect(Date.now() - started).toBeGreaterThanOrEqual(100);
      expect(RL.getStreamSlots().active('stream:player:gam_rl:P_long')).toBe(0);
    } finally {
      G.STREAM_LIMITS.maxDurationMs = saved;
    }
  });
});
