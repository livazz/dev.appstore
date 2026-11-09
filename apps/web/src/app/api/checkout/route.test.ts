import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, eq, orders } from '@wolleen/db';
import { clearPendingOrders, FX, getOrder, seedPaymentsFixtures } from '@/test/payments-fixtures';
import { GET, POST } from './route';

vi.mock('@wolleen/db', async (importOriginal) => {
  const { createTestDb } = await import('@wolleen/db/testing');
  (globalThis as { __wolleenDb?: unknown }).__wolleenDb = await createTestDb();
  return importOriginal();
});

vi.mock('@/server/delivery', () => ({ enqueueDelivery: vi.fn(async () => 'dlv_x') }));

const session = vi.hoisted(() => ({ user: null as null | { id: string; email: string; name: string } }));
vi.mock('@/server/session', () => ({ getCurrentUser: async () => session.user }));

function post(body: unknown, opts: { contentType?: string; headers?: Record<string, string> } = {}) {
  return POST(
    new Request('http://localhost:3006/api/checkout', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...opts.headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

const OK_BODY = { itemId: FX.item, withdrawalWaiver: true };

async function buyerOrderCount() {
  return (await db.select().from(orders).where(eq(orders.userId, FX.buyer.id))).length;
}

beforeAll(async () => {
  await seedPaymentsFixtures();
});

beforeEach(async () => {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('APP_URL', '');
  vi.stubEnv('WOLLEEN_ALLOW_TEST_PAYMENTS', '');
  session.user = FX.buyer;
  await clearPendingOrders();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/checkout', () => {
  it('non connecté → 401 avec redirection vers /login?next=…', async () => {
    session.user = null;
    const res = await post(OK_BODY);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthenticated');
    expect(body.redirect).toBe(`/login?next=${encodeURIComponent(`/games/${FX.game.slug}?item=${FX.item}`)}`);
  });

  it('compte de jeu non lié → 409 avec redirection vers la liaison', async () => {
    session.user = FX.stranger;
    const res = await post(OK_BODY);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('not_linked');
    expect(body.redirect).toBe(`/games/${FX.game.slug}/link?item=${FX.item}`);
  });

  it('compte lié, mode simulation → { url: /checkout/mock?order=… }', async () => {
    const res = await post(OK_BODY);
    expect(res.status).toBe(200);
    const { url, orderId } = await res.json();
    expect(url).toBe(`/checkout/mock?order=${orderId}`);
    expect((await getOrder(orderId))?.status).toBe('pending');
  });

  it('article indisponible → 404', async () => {
    expect((await post({ ...OK_BODY, itemId: FX.inactiveItem })).status).toBe(404);
    expect((await post({ ...OK_BODY, itemId: FX.draftItem })).status).toBe(404);
  });

  it('corps invalide → 400, type de contenu non JSON → 415', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post('pas du json')).status).toBe(400);
    expect((await post(`{"itemId":"${FX.item}"}`, { contentType: 'text/plain' })).status).toBe(415);
  });

  // CHK-PAY-01 : le prix ne vient jamais du client.
  it('refuse toute clé en plus de itemId (prix, devise, quantité…) → 400, aucune commande', async () => {
    const before = await buyerOrderCount();
    for (const extra of [{ priceCents: 1 }, { currency: 'USD' }, { quantity: 100 }, { gameId: FX.draftGame.id }, { playerId: 'P-autre' }]) {
      const res = await post({ ...OK_BODY, ...extra });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('invalid_request');
    }
    expect(await buyerOrderCount()).toBe(before);
  });

  // Conformité consommateur : case de renonciation obligatoire, preuve stockée.
  it('case de livraison immédiate absente ou décochée → 400 consent_required, aucune commande', async () => {
    const before = await buyerOrderCount();
    for (const body of [{ itemId: FX.item }, { itemId: FX.item, withdrawalWaiver: false }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('consent_required');
    }
    expect(await buyerOrderCount()).toBe(before);
  });

  it('stocke la preuve du consentement : horodatage, version des CGV, IP tronquée', async () => {
    vi.stubEnv('WOLLEEN_CGV_VERSION', 'cgv-test-v3');
    const before = Date.now();
    const res = await post(OK_BODY, { headers: { 'x-forwarded-for': '203.0.113.77, 10.0.0.1' } });
    expect(res.status).toBe(200);
    const o = await getOrder((await res.json()).orderId);
    expect(o?.termsVersion).toBe('cgv-test-v3');
    expect(o?.consentIp).toBe('203.0.113.0');
    expect(o?.withdrawalWaiverAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(o?.amountCents).toBe(799);
  });

  // CHK-AUTH-07 : requête d'une autre origine refusée.
  it('Origin étrangère → 403 ; même origine → acceptée', async () => {
    const before = await buyerOrderCount();
    expect((await post(OK_BODY, { headers: { origin: 'https://evil.tld' } })).status).toBe(403);
    expect((await post(OK_BODY, { headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    expect(await buyerOrderCount()).toBe(before);
    vi.stubEnv('APP_URL', 'https://wolleen.example');
    expect((await post(OK_BODY, { headers: { origin: 'https://wolleen.example' } })).status).toBe(200);
  });

  // CHK-PAY-10 : jamais de simulation en production.
  it('production sans clé Stripe → 503 explicite', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', 'https://wolleen.example');
    const before = await buyerOrderCount();
    const res = await post(OK_BODY);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('payments_unavailable');
    expect(await buyerOrderCount()).toBe(before);
  });

  it('production avec une clé sk_test_ → 503, sauf WOLLEEN_ALLOW_TEST_PAYMENTS=1', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', 'https://wolleen.example');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
    const res = await post(OK_BODY);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('payments_unavailable');

    // Préproduction explicite : la configuration passe (le studio de test n'a pas de compte Connect → 409).
    vi.stubEnv('WOLLEEN_ALLOW_TEST_PAYMENTS', '1');
    const allowed = await post(OK_BODY);
    expect(allowed.status).toBe(409);
    expect((await allowed.json()).error.code).toBe('seller_not_ready');
  });

  // CHK-PAY-05 : pas d'URL de retour dérivée de l'en-tête Host en production.
  it('production sans APP_URL → 503', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_fake');
    expect((await post(OK_BODY)).status).toBe(503);
  });

  it('limite anti-spam des commandes en attente → 429', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await post(OK_BODY)).status);
    expect(codes).toEqual([200, 200, 200, 200, 200, 429]);
  });
});

describe('GET /api/checkout?gameId=…', () => {
  const get = (qs = '') => GET(new Request(`http://localhost/api/checkout${qs}`));

  it('renvoie le joueur lié', async () => {
    expect(await (await get(`?gameId=${FX.game.id}`)).json()).toEqual({
      signedIn: true,
      link: { playerId: FX.player.id, playerName: FX.player.name },
      item: null,
    });
  });

  it('avec itemId : prix lu en base pour le bouton « Payer X € »', async () => {
    const body = await (await get(`?gameId=${FX.game.id}&itemId=${FX.item}`)).json();
    expect(body.item).toEqual({ priceCents: 799, currency: 'EUR', title: 'Sac de gemmes' });
    // Article inactif, d'un autre jeu ou d'un jeu non publié : pas de prix.
    expect((await (await get(`?gameId=${FX.game.id}&itemId=${FX.inactiveItem}`)).json()).item).toBeNull();
    expect((await (await get(`?gameId=${FX.game.id}&itemId=${FX.draftItem}`)).json()).item).toBeNull();
  });

  it('sans liaison / sans session', async () => {
    session.user = FX.stranger;
    expect(await (await get(`?gameId=${FX.game.id}`)).json()).toEqual({ signedIn: true, link: null, item: null });
    session.user = null;
    expect(await (await get(`?gameId=${FX.game.id}`)).json()).toEqual({ signedIn: false, link: null, item: null });
  });

  it('gameId manquant → 400', async () => {
    expect((await get()).status).toBe(400);
  });
});
