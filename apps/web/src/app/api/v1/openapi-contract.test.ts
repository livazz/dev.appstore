/*
 * Test de contrat de l'API publique v1 : chaque route est appelée (vrais handlers, base de test PGlite en mémoire) dans
 * ses cas nominaux et d'erreur, et chaque réponse est validée contre la spécification OpenAPI servie sur
 * /api/openapi.json (statut documenté, en-têtes requis, type de contenu, schéma du corps, événements SSE).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, hashApiKey } from '@devappstore/core';
import type { DB } from '@devappstore/db';
import { buildOpenApiSpec } from '@/lib/openapi/spec';
import { validateResponse, validateSseEvent } from '@/lib/openapi/validate';

vi.mock('server-only', () => ({}));
vi.mock('@devappstore/db', async () => {
  const schema = await import('@devappstore/db/schema');
  const orm = await import('drizzle-orm');
  const { createTestDb } = await import('@devappstore/db/testing');
  return { ...schema, schema, ...orm, db: await createTestDb() };
});

const D = await import('@devappstore/db');
const db = D.db as DB;
const { enqueueDelivery, enqueueRefund } = await import('@/server/delivery');
const { redeemLinkCode } = await import('@/server/linking');
const { setRateLimitStore, MemoryRateLimitStore } = await import('@/server/rate-limit');
const linkCodesRoute = await import('./link-codes/route');
const linkRequestsRoute = await import('./link-requests/[id]/route');
const deliveriesRoute = await import('./deliveries/route');
const ackRoute = await import('./deliveries/[id]/ack/route');
const streamRoute = await import('./deliveries/stream/route');
const playerTokensRoute = await import('./player-tokens/route');

const spec = buildOpenApiSpec({ serverUrl: 'http://devappstore.test' });

const SECRET = 'das_secret_contract_game';
const PUB = 'das_pub_contract_game';
const PUB_NOCODE = 'das_pub_contract_nocode';

type Init = { method?: string; key?: string; token?: string; body?: unknown; rawBody?: string; ip?: string; signal?: AbortSignal };
let ipSeq = 0;
function req(path: string, init: Init = {}) {
  const headers: Record<string, string> = { 'x-forwarded-for': init.ip ?? `10.0.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}` };
  if (init.key) headers.authorization = `Bearer ${init.key}`;
  if (init.token) headers['devappstore-player-token'] = init.token;
  if (init.body !== undefined || init.rawBody !== undefined) headers['content-type'] = 'application/json';
  return new Request(`http://devappstore.test${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.rawBody ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    signal: init.signal,
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const checked = new Set<string>();
/** Valide la réponse contre la spec et renvoie le corps JSON. */
async function contract(path: string, method: string, res: Response, expectedStatus: number) {
  expect(res.status, `${method} ${path}`).toBe(expectedStatus);
  const { errors, body } = await validateResponse(spec, path, method, res);
  expect(errors).toEqual([]);
  checked.add(`${method.toUpperCase()} ${path} ${res.status}`);
  return body as Record<string, unknown>;
}

beforeAll(async () => {
  setRateLimitStore(new MemoryRateLimitStore());
  await db.insert(D.user).values(['usr_c1', 'usr_c2'].map((id) => ({ id, name: id, email: `${id}@t.test`, emailVerified: true })));
  await db.insert(D.studios).values({ id: 'std_c', name: 'C', slug: 'c' });
  const game = (id: string, secret: string, pub: string, extra: Partial<typeof D.games.$inferInsert> = {}) => ({
    id, studioId: 'std_c', slug: id, name: id, theme: DEFAULT_THEME, status: 'live' as const, linkMethods: ['code' as const],
    webhookSecret: `whsec_${id}`, apiKeyHash: hashApiKey(secret), apiKeyPrefix: secret.slice(0, 14), publishableKey: pub, ...extra,
  });
  await db.insert(D.games).values([
    game('gam_c', SECRET, PUB),
    game('gam_nocode', 'das_secret_contract_nocode', PUB_NOCODE, { linkMethods: ['id_confirm'] }),
  ]);
  await db.insert(D.items).values({ id: 'itm_c', gameId: 'gam_c', productId: 'gems_500', title: 'Gemmes', priceCents: 499, style: {} as never });
}, 60_000);

afterAll(() => setRateLimitStore(new MemoryRateLimitStore()));

let orderSeq = 0;
async function paidOrder(playerId: string, userId: string) {
  const id = `ord_c${++orderSeq}`;
  await db.insert(D.orders).values({
    id, userId, gameId: 'gam_c', itemId: 'itm_c', productId: 'gems_500', itemTitle: 'Gemmes', playerId,
    amountCents: 499, platformFeeCents: 25, currency: 'EUR', status: 'paid', paidAt: new Date(),
  });
  await enqueueDelivery(id);
  return id;
}

/* ------------------------------------------------------------------ liaison */

let playerToken = '';

describe('POST /api/v1/link-codes', () => {
  const P = '/api/v1/link-codes';
  it('200 (clé secrète et clé publique)', async () => {
    const body = await contract(P, 'post', await linkCodesRoute.POST(req(P, { method: 'POST', key: SECRET, body: { player_id: 'p_secret', player_name: 'Nova' } })), 200);
    expect(body.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    await contract(P, 'post', await linkCodesRoute.POST(req(P, { method: 'POST', key: PUB, body: { player_id: 'p_pub', player_name: null } })), 200);
  });
  it('400 invalid_json / invalid_request, 401, 403 method_disabled', async () => {
    const e1 = await contract(P, 'post', await linkCodesRoute.POST(req(P, { method: 'POST', key: SECRET, rawBody: '{oups' })), 400);
    expect(e1.error).toMatchObject({ code: 'invalid_json' });
    const e2 = await contract(P, 'post', await linkCodesRoute.POST(req(P, { method: 'POST', key: SECRET, body: { player_id: '' } })), 400);
    expect(e2.error).toMatchObject({ code: 'invalid_request' });
    await contract(P, 'post', await linkCodesRoute.POST(req(P, { method: 'POST', key: 'das_inconnue', body: { player_id: 'x' } })), 401);
    const e3 = await contract(P, 'post', await linkCodesRoute.POST(req(P, { method: 'POST', key: PUB_NOCODE, body: { player_id: 'x' } })), 403);
    expect(e3.error).toMatchObject({ code: 'method_disabled' });
  });
  it('204 préflight', async () => {
    await contract(P, 'options', linkCodesRoute.OPTIONS(), 204);
  });
});

describe('GET /api/v1/link-requests/{id}', () => {
  const P = '/api/v1/link-requests/{id}';
  it('pending → linked (jeton une fois) → claimed ; secrète : linked sans jeton ; 404 ; 401', async () => {
    const created = (await (await linkCodesRoute.POST(req('/api/v1/link-codes', { method: 'POST', key: PUB, body: { player_id: 'player_42' } }))).json()) as Record<string, string>;
    const id = created.link_request_id!;
    const get = (key: string) => linkRequestsRoute.GET(req(`/api/v1/link-requests/${id}`, { key }), params(id));
    expect((await contract(P, 'get', await get(PUB), 200)).status).toBe('pending');

    const [game] = await db.select().from(D.games).where(D.eq(D.games.id, 'gam_c'));
    expect((await redeemLinkCode('usr_c1', game!, created.code!)).ok).toBe(true);
    const linked = await contract(P, 'get', await get(PUB), 200);
    expect(linked).toMatchObject({ status: 'linked', player_id: 'player_42' });
    playerToken = String(linked.player_token);
    expect(await contract(P, 'get', await get(PUB), 200)).toEqual({ status: 'claimed', player_id: 'player_42' });
    expect(await contract(P, 'get', await get(SECRET), 200)).toEqual({ status: 'linked', player_id: 'player_42' });

    const missing = await contract(P, 'get', await linkRequestsRoute.GET(req('/api/v1/link-requests/lnc_x', { key: PUB }), params('lnc_x')), 404);
    expect(missing.error).toMatchObject({ code: 'link_request_not_found' });
    await contract(P, 'get', await linkRequestsRoute.GET(req('/api/v1/link-requests/lnc_x'), params('lnc_x')), 401);
    await contract(P, 'options', linkRequestsRoute.OPTIONS(), 204);
  });

  it('expired', async () => {
    const created = (await (await linkCodesRoute.POST(req('/api/v1/link-codes', { method: 'POST', key: PUB, body: { player_id: 'p_exp' } }))).json()) as Record<string, string>;
    await db.update(D.linkCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(D.eq(D.linkCodes.id, created.link_request_id!));
    const res = await linkRequestsRoute.GET(req(`/api/v1/link-requests/${created.link_request_id}`, { key: PUB }), params(created.link_request_id!));
    expect(await contract(P, 'get', res, 200)).toEqual({ status: 'expired' });
  });
});

/* ------------------------------------------------------------------ livraisons */

describe('livraisons', () => {
  let deliveryId = '';
  let refundId = '';

  beforeAll(async () => {
    expect(playerToken).toMatch(/^das_pt_/);
    const orderId = await paidOrder('player_42', 'usr_c1');
    const second = await paidOrder('player_42', 'usr_c1');
    await db.update(D.orders).set({ status: 'refunded' }).where(D.eq(D.orders.id, second));
    await enqueueRefund(second);
    const rows = await db.select().from(D.deliveries).where(D.eq(D.deliveries.orderId, orderId));
    deliveryId = rows[0]!.id;
  });

  it('GET /api/v1/deliveries : 200 (secrète + player_id, publique + jeton), 400, 401, 403', async () => {
    const P = '/api/v1/deliveries';
    const secret = await contract(P, 'get', await deliveriesRoute.GET(req(`${P}?player_id=player_42`, { key: SECRET })), 200);
    const data = secret.data as { event: string; delivery_id: string }[];
    expect(data.map((e) => e.event).sort()).toEqual(['purchase.completed', 'purchase.refunded']);
    refundId = data.find((e) => e.event === 'purchase.refunded')!.delivery_id;
    const pub = await contract(P, 'get', await deliveriesRoute.GET(req(P, { key: PUB, token: playerToken })), 200);
    expect((pub.data as unknown[]).length).toBe(2);

    expect((await contract(P, 'get', await deliveriesRoute.GET(req(P, { key: SECRET })), 400)).error).toMatchObject({ code: 'invalid_player_id' });
    expect((await contract(P, 'get', await deliveriesRoute.GET(req(P, { key: PUB })), 401)).error).toMatchObject({ code: 'player_token_required' });
    expect((await contract(P, 'get', await deliveriesRoute.GET(req(P, { key: 'das_secret_faux' })), 401)).error).toMatchObject({ code: 'unauthorized' });
    expect((await contract(P, 'get', await deliveriesRoute.GET(req(`${P}?player_id=autre`, { key: PUB, token: playerToken })), 403)).error).toMatchObject({
      code: 'player_mismatch',
    });
    await contract(P, 'options', deliveriesRoute.OPTIONS(), 204);
  });

  it('GET /api/v1/deliveries/stream : 200 text/event-stream, événements purchase conformes ; erreurs JSON', async () => {
    const P = '/api/v1/deliveries/stream';
    const ac = new AbortController();
    const res = await streamRoute.GET(req(P, { key: PUB, token: playerToken, signal: ac.signal }));
    await contract(P, 'get', res, 200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while ((text.match(/event: purchase/g) ?? []).length < 2) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    ac.abort();
    await reader.cancel().catch(() => {});
    expect(text.startsWith('retry: 5000\n\n')).toBe(true);
    const events = text.split('\n\n').filter((b) => b.startsWith('event: '));
    expect(events.length).toBe(2);
    for (const block of events) {
      const lines = Object.fromEntries(block.split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]));
      expect(lines.event).toBe('purchase');
      const data = JSON.parse(lines.data!) as { delivery_id: string };
      expect(lines.id).toBe(data.delivery_id);
      expect(validateSseEvent(spec, P, 'purchase', data)).toEqual([]);
    }

    await contract(P, 'get', await streamRoute.GET(req(P, { key: SECRET })), 400);
    await contract(P, 'get', await streamRoute.GET(req(P, { key: PUB })), 401);
    await contract(P, 'get', await streamRoute.GET(req(`${P}?player_id=autre`, { key: PUB, token: playerToken })), 403);
    await contract(P, 'options', streamRoute.OPTIONS(), 204);
  });

  it('GET /api/v1/deliveries/stream : 429 too_many_streams avec Retry-After', async () => {
    const P = '/api/v1/deliveries/stream';
    const ac = new AbortController();
    const open: Response[] = [];
    let res: Response;
    for (;;) {
      res = await streamRoute.GET(req(`${P}?player_id=p_streams`, { key: SECRET, signal: ac.signal }));
      if (res.status !== 200) break;
      open.push(res);
      expect(open.length).toBeLessThan(10);
    }
    const body = await contract(P, 'get', res, 429);
    expect(body.error).toMatchObject({ code: 'too_many_streams' });
    ac.abort();
    await Promise.all(open.map((r) => r.body!.cancel().catch(() => {})));
  });

  it('POST /api/v1/deliveries/{id}/ack : 200 idempotent, 404, 401, 403', async () => {
    const P = '/api/v1/deliveries/{id}/ack';
    const ack = (id: string, init: Init) => ackRoute.POST(req(`/api/v1/deliveries/${id}/ack`, { method: 'POST', ...init }), params(id));
    expect(await contract(P, 'post', await ack(deliveryId, { key: PUB, token: playerToken }), 200)).toEqual({ ok: true });
    expect(await contract(P, 'post', await ack(deliveryId, { key: SECRET }), 200)).toEqual({ ok: true });
    await contract(P, 'post', await ack(refundId, { key: SECRET }), 200);
    expect((await contract(P, 'post', await ack('dlv_inconnue', { key: SECRET }), 404)).error).toMatchObject({ code: 'delivery_not_found' });
    expect((await contract(P, 'post', await ack(deliveryId, { key: PUB }), 401)).error).toMatchObject({ code: 'player_token_required' });
    const mismatch = await ackRoute.POST(req(`/api/v1/deliveries/${deliveryId}/ack?player_id=autre`, { method: 'POST', key: PUB, token: playerToken }), params(deliveryId));
    expect((await contract(P, 'post', mismatch, 403)).error).toMatchObject({ code: 'player_mismatch' });
    await contract(P, 'options', ackRoute.OPTIONS(), 204);
  });
});

/* ------------------------------------------------------------------ jetons joueur et limitation */

describe('DELETE /api/v1/player-tokens', () => {
  const P = '/api/v1/player-tokens';
  it('400 sans player_id, 200 (publique : ce jeton ; secrète : tous), 401 avec un jeton révoqué', async () => {
    expect((await contract(P, 'delete', await playerTokensRoute.DELETE(req(P, { method: 'DELETE', key: SECRET })), 400)).error).toMatchObject({ code: 'invalid_player_id' });
    expect(await contract(P, 'delete', await playerTokensRoute.DELETE(req(P, { method: 'DELETE', key: PUB, token: playerToken })), 200)).toEqual({ ok: true, revoked: 1 });
    await contract(P, 'delete', await playerTokensRoute.DELETE(req(P, { method: 'DELETE', key: PUB, token: playerToken })), 401);
    expect(await contract(P, 'delete', await playerTokensRoute.DELETE(req(`${P}?player_id=player_42`, { method: 'DELETE', key: SECRET })), 200)).toEqual({ ok: true, revoked: 0 });
    await contract(P, 'options', playerTokensRoute.OPTIONS(), 204);
  });
});

describe('limitation de débit', () => {
  it('429 rate_limited avec Retry-After (par IP, avant authentification)', async () => {
    const P = '/api/v1/link-codes';
    let res: Response | undefined;
    for (let i = 0; i < 40; i++) {
      res = await linkCodesRoute.POST(req(P, { method: 'POST', key: 'das_inconnue', body: { player_id: 'x' }, ip: '203.0.113.9' }));
      if (res.status === 429) break;
      await res.body?.cancel();
    }
    const body = await contract(P, 'post', res!, 429);
    expect(body.error).toMatchObject({ code: 'rate_limited' });
    expect(Number(res!.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('couverture du contrat', () => {
  it('chaque opération de la spec a été exercée avec au moins sa réponse 2xx', () => {
    for (const [path, item] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(item)) {
        const ok = Object.keys((op as { responses: object }).responses).find((s) => s.startsWith('2'))!;
        expect(checked, `${method.toUpperCase()} ${path} ${ok}`).toContain(`${method.toUpperCase()} ${path} ${ok}`);
      }
    }
    // Et chaque statut d'erreur documenté pour les routes.
    const missing: string[] = [];
    for (const [path, item] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(item)) {
        for (const status of Object.keys((op as { responses: object }).responses)) {
          if (status === '429' && !path.includes('stream') && !path.includes('link-codes')) continue; // même garde guardApi pour toutes les routes
          if (!checked.has(`${method.toUpperCase()} ${path} ${status}`)) missing.push(`${method.toUpperCase()} ${path} ${status}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
