import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FX, getOrder, seedPaymentsFixtures } from '@/test/payments-fixtures';
import { GET, POST } from './route';

vi.mock('@wolleen/db', async (importOriginal) => {
  const { createTestDb } = await import('@wolleen/db/testing');
  (globalThis as { __wolleenDb?: unknown }).__wolleenDb = await createTestDb();
  return importOriginal();
});

vi.mock('@/server/delivery', () => ({ enqueueDelivery: vi.fn(async () => 'dlv_x') }));

const session = vi.hoisted(() => ({ user: null as null | { id: string; email: string; name: string } }));
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.user }));

function post(body: unknown, contentType = 'application/json') {
  return POST(
    new Request('http://localhost:3006/api/checkout', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

beforeAll(async () => {
  await seedPaymentsFixtures();
});

beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('APP_URL', '');
  session.user = FX.buyer;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/checkout', () => {
  it('non connecté → 401 avec redirection vers /login?next=…', async () => {
    session.user = null;
    const res = await post({ itemId: FX.item });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthenticated');
    expect(body.redirect).toBe(`/login?next=${encodeURIComponent(`/games/${FX.game.slug}?item=${FX.item}`)}`);
  });

  it('compte de jeu non lié → 409 avec redirection vers la liaison', async () => {
    session.user = FX.stranger;
    const res = await post({ itemId: FX.item });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('not_linked');
    expect(body.redirect).toBe(`/games/${FX.game.slug}/link?item=${FX.item}`);
  });

  it('compte lié, mode simulation → { url: /checkout/mock?order=… }', async () => {
    const res = await post({ itemId: FX.item });
    expect(res.status).toBe(200);
    const { url, orderId } = await res.json();
    expect(url).toBe(`/checkout/mock?order=${orderId}`);
    expect((await getOrder(orderId))?.status).toBe('pending');
  });

  it('article indisponible → 404', async () => {
    expect((await post({ itemId: FX.inactiveItem })).status).toBe(404);
  });

  it('corps invalide → 400, type de contenu non JSON → 415', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post('pas du json')).status).toBe(400);
    expect((await post(`{"itemId":"${FX.item}"}`, 'text/plain')).status).toBe(415);
  });

  it('production sans clé Stripe → 503', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await post({ itemId: FX.item });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('payments_unavailable');
  });
});

describe('GET /api/checkout?gameId=…', () => {
  const get = (gameId?: string) => GET(new Request(`http://localhost/api/checkout${gameId ? `?gameId=${gameId}` : ''}`));

  it('renvoie le joueur lié', async () => {
    expect(await (await get(FX.game.id)).json()).toEqual({ signedIn: true, link: { playerId: FX.player.id, playerName: FX.player.name } });
  });

  it('sans liaison / sans session', async () => {
    session.user = FX.stranger;
    expect(await (await get(FX.game.id)).json()).toEqual({ signedIn: true, link: null });
    session.user = null;
    expect(await (await get(FX.game.id)).json()).toEqual({ signedIn: false, link: null });
  });

  it('gameId manquant → 400', async () => {
    expect((await get()).status).toBe(400);
  });
});
