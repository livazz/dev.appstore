/*
 * Tests de non-régression « sec/delivery-keys » — API v1 : séparation clé secrète / clé publique + jeton joueur
 * (CHK-API-06, D-05, T-DLV-04, T-LNK-04), authentification (CHK-API-01/02/03/04, D-04), ack restreint (CHK-DLV-08),
 * liste / flux restreints (CHK-DLV-07), CORS sans credentials (CHK-API-10).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, hashApiKey, type PurchaseEvent } from '@devappstore/core';
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
const { enqueueDelivery } = await import('@/server/delivery');
const { redeemLinkCode } = await import('@/server/linking');
const apiKey = await import('@/server/api-key');
const linkCodesRoute = await import('./link-codes/route');
const linkRequestsRoute = await import('./link-requests/[id]/route');
const deliveriesRoute = await import('./deliveries/route');
const ackRoute = await import('./deliveries/[id]/ack/route');
const streamRoute = await import('./deliveries/stream/route');
const playerTokensRoute = await import('./player-tokens/route');

const SECRET_A = 'das_secret_test_game_a';
const PUB_A = 'das_pub_test_game_a';
const SECRET_B = 'das_secret_test_game_b';
const PUB_B = 'das_pub_test_game_b';
const LEGACY_A2 = 'das_live_ancienne_cle';

type Init = { method?: string; key?: string; token?: string; origin?: string; body?: unknown; signal?: AbortSignal };
function req(path: string, init: Init = {}) {
  const headers: Record<string, string> = {};
  if (init.key) headers.authorization = `Bearer ${init.key}`;
  if (init.token) headers['devappstore-player-token'] = init.token;
  if (init.origin) headers.origin = init.origin;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`http://devappstore.test${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

beforeAll(async () => {
  await db.insert(D.user).values(
    ['usr_u', 'usr_v', 'usr_evil'].map((id) => ({ id, name: id, email: `${id}@t.test`, emailVerified: true })),
  );
  await db.insert(D.studios).values({ id: 'std_t', name: 'T', slug: 't' });
  const game = (id: string, secret: string, pub: string, extra: Partial<typeof D.games.$inferInsert> = {}) => ({
    id, studioId: 'std_t', slug: id, name: id, theme: DEFAULT_THEME, status: 'live' as const, linkMethods: ['code' as const],
    webhookSecret: `whsec_${id}`, apiKeyHash: hashApiKey(secret), apiKeyPrefix: secret.slice(0, 14), publishableKey: pub, ...extra,
  });
  await db.insert(D.games).values([
    game('gam_a', SECRET_A, PUB_A),
    game('gam_b', SECRET_B, PUB_B),
    game('gam_legacy', LEGACY_A2, 'das_pub_test_legacy'),
    game('gam_susp', 'das_secret_test_susp', 'das_pub_test_susp', { status: 'suspended' }),
  ]);
  await db.insert(D.items).values(
    ['gam_a', 'gam_b'].map((g) => ({ id: `itm_${g}`, gameId: g, productId: 'gems', title: 'Gemmes', priceCents: 199, style: {} as never })),
  );
}, 60_000);

let seq = 0;
async function purchase(gameId: string, playerId: string, userId: string) {
  const id = `ord_v${++seq}`;
  await db.insert(D.orders).values({
    id, userId, gameId, itemId: `itm_${gameId}`, productId: 'gems', itemTitle: 'Gemmes', playerId,
    amountCents: 199, platformFeeCents: 10, currency: 'EUR', status: 'paid', paidAt: new Date(),
  });
  return enqueueDelivery(id);
}

/** Liaison complète côté SDK : code avec la clé publique, saisie sur le site par `userId`, échange contre un jeton. */
async function linkDevice(pub: string, gameId: string, playerId: string, userId: string) {
  const res = await linkCodesRoute.POST(req('/api/v1/link-codes', { method: 'POST', key: pub, body: { player_id: playerId } }));
  expect(res.status).toBe(200);
  const body = await json(res);
  const [game] = await db.select().from(D.games).where(D.eq(D.games.id, gameId));
  const redeemed = await redeemLinkCode(userId, game!, String(body.code), { confirmed: true });
  expect(redeemed.ok).toBe(true);
  const poll = await json(await linkRequestsRoute.GET(req(`/api/v1/link-requests/${body.link_request_id}`, { key: pub }), params(String(body.link_request_id))));
  expect(poll.status).toBe('linked');
  return { token: String(poll.player_token), linkRequestId: String(body.link_request_id) };
}

/* ---------------------------------------------------------------- authentification */

describe('authentification de l’API v1 (CHK-API-01/03/04, D-04)', () => {
  const routes: [string, (r: Request) => Promise<Response>][] = [
    ['link-codes', (r) => linkCodesRoute.POST(r)],
    ['deliveries', (r) => deliveriesRoute.GET(r)],
    ['stream', (r) => streamRoute.GET(r)],
    ['ack', (r) => ackRoute.POST(r, params('dlv_x'))],
    ['link-requests', (r) => linkRequestsRoute.GET(r, params('lnc_x'))],
    ['player-tokens', (r) => playerTokensRoute.DELETE(r)],
  ];

  it.each(routes)('%s : 401 sans clé, clé inconnue, clé dans l’URL, jeu suspendu', async (_name, handler) => {
    const path = '/api/v1/x?player_id=p1';
    const body = { player_id: 'p1' };
    for (const r of [
      req(path, { method: 'POST', body }),
      req(path, { method: 'POST', key: 'das_faux', body }),
      req(`${path}&api_key=${SECRET_A}&access_token=${SECRET_A}`, { method: 'POST', body }),
      req(path, { method: 'POST', key: 'das_secret_test_susp', body }),
      req(path, { method: 'POST', key: 'das_pub_test_susp', body }),
    ]) {
      const res = await handler(r);
      expect(res.status).toBe(401);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    }
  });

  it('authenticateApi ne renvoie aucun secret ; authenticateGame refuse la clé publique et les jeux suspendus', async () => {
    const auth = await apiKey.authenticateApi(req('/', { key: SECRET_A }));
    expect(auth?.kind).toBe('secret');
    expect(Object.keys(auth!.game).sort()).toEqual(['currency', 'id', 'linkMethods', 'status', 'studioId', 'webhookUrl']);
    expect((await apiKey.authenticateApi(req('/', { key: PUB_A })))?.kind).toBe('publishable');
    expect((await apiKey.authenticateApi(req('/', { key: LEGACY_A2 })))?.game.id).toBe('gam_legacy'); // anciennes clés das_live_ acceptées
    expect(await apiKey.authenticateApi(req('/', { key: 'das_secret_test_susp' }))).toBeNull();
    expect('authenticateGame' in apiKey).toBe(false); // ancienne fonction (ligne complète avec secrets) supprimée
  });

  it('un jeu créé sans clé publique en reçoit une (stable) à l’ouverture de l’onglet Intégration', async () => {
    await db.insert(D.games).values({
      id: 'gam_nokey', studioId: 'std_t', slug: 'gam_nokey', name: 'Sans clé', theme: DEFAULT_THEME,
      webhookSecret: 'whsec_x', apiKeyHash: hashApiKey('das_secret_nokey'), apiKeyPrefix: 'das_secret_noke',
    });
    const [k1, k2] = await Promise.all([apiKey.ensurePublishableKey('gam_nokey'), apiKey.ensurePublishableKey('gam_nokey')]);
    expect(k1).toMatch(/^das_pub_/);
    expect(k2).toBe(k1);
    expect(await apiKey.ensurePublishableKey('gam_nokey')).toBe(k1);
    expect((await apiKey.authenticateApi(req('/', { key: k1! })))?.game.id).toBe('gam_nokey');
    expect(await apiKey.ensurePublishableKey('gam_inconnu')).toBeNull();
  });

  it('nouvelles clés : secrète das_secret_ (empreinte seule), publique das_pub_, jeton das_pt_', () => {
    const s = apiKey.generateSecretApiKey();
    expect(s.key.startsWith('das_secret_')).toBe(true);
    expect(s.hash).toBe(hashApiKey(s.key));
    expect(s.key.startsWith(s.prefix)).toBe(true);
    expect(s.prefix.length).toBeLessThan(s.key.length - 20);
    expect(apiKey.generatePublishableKey().startsWith('das_pub_')).toBe(true);
    const t = apiKey.generatePlayerToken();
    expect(t.token.startsWith('das_pt_')).toBe(true);
    expect(t.hash).toBe(hashApiKey(t.token));
  });
});

/* ---------------------------------------------------------------- clé publique + jeton joueur */

describe('clé publique : liaison → jeton joueur (D-05)', () => {
  it('le code renvoie un link_request_id ; le jeton n’est délivré qu’une fois, après la saisie', async () => {
    const res = await linkCodesRoute.POST(req('/api/v1/link-codes', { method: 'POST', key: PUB_A, body: { player_id: 'P_flow' } }));
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(String(body.link_request_id)).toMatch(/^lnc_/);
    const id = String(body.link_request_id);
    const poll = async (key = PUB_A) => json(await linkRequestsRoute.GET(req(`/api/v1/link-requests/${id}`, { key }), params(id)));

    expect(await poll()).toMatchObject({ status: 'pending', player_id: 'P_flow' });
    const [game] = await db.select().from(D.games).where(D.eq(D.games.id, 'gam_a'));
    expect((await redeemLinkCode('usr_u', game!, String(body.code), { confirmed: true })).ok).toBe(true);

    const [first, second] = await Promise.all([poll(), poll()]);
    const issued = [first, second].filter((p) => typeof p.player_token === 'string');
    expect(issued).toHaveLength(1); // échange unique, même en concurrence
    expect(String(issued[0]!.player_token)).toMatch(/^das_pt_/);
    expect([first.status, second.status].sort()).toEqual(['claimed', 'linked']);
    expect(await poll()).toEqual({ status: 'claimed', player_id: 'P_flow' });
    expect(await poll(SECRET_A)).toEqual({ status: 'linked', player_id: 'P_flow' }); // clé secrète : statut seulement

    // Seule l'empreinte est stockée, liée au jeu, au joueur et au compte qui a saisi le code.
    const [row] = await db.select().from(D.playerTokens).where(D.eq(D.playerTokens.tokenHash, hashApiKey(String(issued[0]!.player_token))));
    expect(row).toMatchObject({ gameId: 'gam_a', playerId: 'P_flow', userId: 'usr_u', revokedAt: null });
    expect(JSON.stringify(await db.select().from(D.playerTokens))).not.toContain(String(issued[0]!.player_token));
  });

  it('demande d’un autre jeu, demande créée par le serveur, demande expirée → pas de jeton', async () => {
    const mk = async (key: string) => json(await linkCodesRoute.POST(req('/api/v1/link-codes', { method: 'POST', key, body: { player_id: 'P_x' } })));
    const a = await mk(PUB_A);
    const id = String(a.link_request_id);
    expect((await linkRequestsRoute.GET(req('/', { key: PUB_B }), params(id))).status).toBe(404);

    const fromServer = await mk(SECRET_A);
    expect((await linkRequestsRoute.GET(req('/', { key: PUB_A }), params(String(fromServer.link_request_id)))).status).toBe(404);
    expect(await json(await linkRequestsRoute.GET(req('/', { key: SECRET_A }), params(String(fromServer.link_request_id))))).toMatchObject({ status: 'pending' });

    const late = await mk(PUB_A);
    await db.update(D.linkCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(D.eq(D.linkCodes.id, String(late.link_request_id)));
    expect(await json(await linkRequestsRoute.GET(req('/', { key: PUB_A }), params(String(late.link_request_id))))).toEqual({ status: 'expired' });

    // Code saisi mais jeton réclamé trop tard (> 1 h).
    const old = await mk(PUB_A);
    const [game] = await db.select().from(D.games).where(D.eq(D.games.id, 'gam_a'));
    await redeemLinkCode('usr_u', game!, String(old.code), { confirmed: true });
    await db.update(D.linkCodes).set({ consumedAt: new Date(Date.now() - 2 * 3600_000) }).where(D.eq(D.linkCodes.id, String(old.link_request_id)));
    expect(await json(await linkRequestsRoute.GET(req('/', { key: PUB_A }), params(String(old.link_request_id))))).toEqual({ status: 'expired' });
  });
});

describe('clé publique : livraisons restreintes au joueur du jeton (CHK-API-06, CHK-DLV-07/08)', () => {
  it('sans jeton : link-codes seulement ; deliveries / stream / ack refusés', async () => {
    for (const res of [
      await deliveriesRoute.GET(req('/api/v1/deliveries?player_id=P1', { key: PUB_A })),
      await streamRoute.GET(req('/api/v1/deliveries/stream?player_id=P1', { key: PUB_A })),
      await ackRoute.POST(req('/', { method: 'POST', key: PUB_A }), params('dlv_x')),
      await deliveriesRoute.GET(req('/api/v1/deliveries?player_id=P1', { key: PUB_A, token: 'das_pt_invente' })),
    ]) {
      expect(res.status).toBe(401);
      expect((await json(res)).error).toMatchObject({ code: 'player_token_required' });
    }
  });

  it("un tiers qui fabrique un code pour le player_id d'une victime ne voit ni n'acquitte ses achats (T-LNK-04)", async () => {
    // La victime (usr_u, joueur P1) a lié son appareil et acheté ; un autre compte (usr_v) offre aussi un achat à P1.
    const { token: victimToken } = await linkDevice(PUB_A, 'gam_a', 'P1', 'usr_u');
    const own = await purchase('gam_a', 'P1', 'usr_u');
    const gift = await purchase('gam_a', 'P1', 'usr_v');
    const otherPlayer = await purchase('gam_a', 'P2', 'usr_u');

    const list = async (token: string, q = '') =>
      (await json(await deliveriesRoute.GET(req(`/api/v1/deliveries${q}`, { key: PUB_A, token })))).data as PurchaseEvent[];
    expect((await list(victimToken)).map((e) => e.delivery_id)).toEqual([own]);
    expect((await list(victimToken, '?player_id=P1')).map((e) => e.delivery_id)).toEqual([own]);
    const mismatch = await deliveriesRoute.GET(req('/api/v1/deliveries?player_id=P2', { key: PUB_A, token: victimToken }));
    expect(mismatch.status).toBe(403);

    // L'attaquant lie SON compte au player_id de la victime : il ne voit que ses propres achats (aucun).
    const { token: evilToken } = await linkDevice(PUB_A, 'gam_a', 'P1', 'usr_evil');
    expect(await list(evilToken)).toEqual([]);
    const evilAck = await ackRoute.POST(req('/', { method: 'POST', key: PUB_A, token: evilToken }), params(own));
    expect(evilAck.status).toBe(404);
    const [stillOpen] = await db.select().from(D.deliveries).where(D.eq(D.deliveries.id, own));
    expect(stillOpen!.status).not.toBe('acknowledged');

    // La victime acquitte ses achats, pas ceux d'un autre joueur ni d'un autre acheteur.
    expect((await ackRoute.POST(req('/', { method: 'POST', key: PUB_A, token: victimToken }), params(otherPlayer))).status).toBe(404);
    expect((await ackRoute.POST(req('/', { method: 'POST', key: PUB_A, token: victimToken }), params(gift))).status).toBe(404);
    expect((await ackRoute.POST(req('/', { method: 'POST', key: PUB_A, token: victimToken }), params(own))).status).toBe(200);

    // Le jeton d'un jeu n'ouvre rien avec la clé publique d'un autre jeu.
    expect((await deliveriesRoute.GET(req('/api/v1/deliveries', { key: PUB_B, token: victimToken }))).status).toBe(401);

    // Clé secrète (serveur du studio) : tout le joueur, player_id obligatoire, rien d'un autre jeu.
    expect((await deliveriesRoute.GET(req('/api/v1/deliveries', { key: SECRET_A }))).status).toBe(400);
    const server = (await json(await deliveriesRoute.GET(req('/api/v1/deliveries?player_id=P1', { key: SECRET_A })))).data as PurchaseEvent[];
    expect(server.map((e) => e.delivery_id)).toContain(gift);
    expect((await json(await deliveriesRoute.GET(req('/api/v1/deliveries?player_id=P1', { key: SECRET_B })))).data).toEqual([]);
    expect((await ackRoute.POST(req('/', { method: 'POST', key: SECRET_B }), params(gift))).status).toBe(404);
  });

  it('flux SSE : arriéré et direct limités aux achats du compte du jeton', async () => {
    const { token } = await linkDevice(PUB_A, 'gam_a', 'P_sse', 'usr_u');
    const backlog = await purchase('gam_a', 'P_sse', 'usr_u');
    const foreignBacklog = await purchase('gam_a', 'P_sse', 'usr_v');
    const ctrl = new AbortController();
    const res = await streamRoute.GET(req('/api/v1/deliveries/stream', { key: PUB_A, token, signal: ctrl.signal }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = '';
    const readUntil = async (needle: string, ms = 3000) => {
      const deadline = Date.now() + ms;
      while (!text.includes(needle) && Date.now() < deadline) {
        const r = await Promise.race([reader.read(), new Promise<null>((ok) => setTimeout(() => ok(null), deadline - Date.now()))]);
        if (!r || r.done) break;
        text += dec.decode(r.value);
      }
    };
    await readUntil(backlog);
    expect(text).toContain(backlog);
    const foreignLive = await purchase('gam_a', 'P_sse', 'usr_v');
    const ownLive = await purchase('gam_a', 'P_sse', 'usr_u');
    await readUntil(ownLive);
    expect(text).toContain(ownLive);
    expect(text).not.toContain(foreignBacklog);
    expect(text).not.toContain(foreignLive);
    ctrl.abort();
    await reader.cancel().catch(() => {});
  });

  it('révocation : par le SDK (son jeton) et par le serveur du studio (tous les jetons du joueur)', async () => {
    const { token: t1 } = await linkDevice(PUB_A, 'gam_a', 'P_rev', 'usr_u');
    const { token: t2 } = await linkDevice(PUB_A, 'gam_a', 'P_rev', 'usr_u');
    const ok = (t: string) => deliveriesRoute.GET(req('/api/v1/deliveries', { key: PUB_A, token: t }));
    expect((await ok(t1)).status).toBe(200);

    expect(await json(await playerTokensRoute.DELETE(req('/', { method: 'DELETE', key: PUB_A, token: t1 })))).toEqual({ ok: true, revoked: 1 });
    expect((await ok(t1)).status).toBe(401);
    expect((await ok(t2)).status).toBe(200);

    expect((await playerTokensRoute.DELETE(req('/', { method: 'DELETE', key: SECRET_A }))).status).toBe(400);
    expect(await json(await playerTokensRoute.DELETE(req('/?player_id=P_rev', { method: 'DELETE', key: SECRET_A })))).toEqual({ ok: true, revoked: 1 });
    expect((await ok(t2)).status).toBe(401);
  });
});

/* ---------------------------------------------------------------- CORS */

describe('CORS de l’API v1 (CHK-API-10)', () => {
  const preflights: [string, () => Response][] = [
    ['link-codes', linkCodesRoute.OPTIONS],
    ['link-requests', linkRequestsRoute.OPTIONS],
    ['deliveries', deliveriesRoute.OPTIONS],
    ['stream', streamRoute.OPTIONS],
    ['ack', ackRoute.OPTIONS],
    ['player-tokens', playerTokensRoute.OPTIONS],
  ];
  it.each(preflights)('%s : préflight ouvert, sans credentials, en-tête du jeton autorisé', (_n, options) => {
    const res = options();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    expect(res.headers.get('access-control-allow-headers')).toContain('DevAppStore-Player-Token');
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(res.headers.get('access-control-allow-methods')).toContain('DELETE');
  });

  it("n'écho jamais l'origine et n'autorise jamais les credentials (succès comme erreur)", async () => {
    const evil = 'https://evil.tld';
    for (const res of [
      await deliveriesRoute.GET(req('/api/v1/deliveries?player_id=P1', { key: SECRET_A, origin: evil })),
      await deliveriesRoute.GET(req('/api/v1/deliveries?player_id=P1', { origin: evil })),
      await linkCodesRoute.POST(req('/api/v1/link-codes', { method: 'POST', key: PUB_A, origin: evil, body: { player_id: 'P_cors' } })),
    ]) {
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    }
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});
