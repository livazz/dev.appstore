/*
 * Tests de non-régression — revue de sécurité 2026-11, domaine « API v1, liaison, livraison, appels sortants »
 * (docs/security/revue-2026-11/api-liaison-livraison.md, constats F1 à F13, et A-05 / A-08 de la revue « auth »).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, hashApiKey, signLookup, verifyLookupSignature, verifySignature, type StudioRole } from '@devappstore/core';
import type { DB } from '@devappstore/db';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/server', () => ({ after: () => {} }));
const session = vi.hoisted(() => ({ role: 'owner' as StudioRole, userId: 'usr_owner' }));
vi.mock('@/server/session', () => ({
  requireGameAccess: async (_gameId: string, roles?: StudioRole[]) => {
    if (roles && !roles.includes(session.role)) throw new Error('FORBIDDEN');
    return { user: { id: session.userId }, studioId: 'std_s', role: session.role };
  },
}));
vi.mock('@devappstore/db', async () => {
  const schema = await import('@devappstore/db/schema');
  const orm = await import('drizzle-orm');
  const { createTestDb } = await import('@devappstore/db/testing');
  return { ...schema, schema, ...orm, db: await createTestDb() };
});

const D = await import('@devappstore/db');
const db = D.db as DB;
const { clientIp, trustedProxyHops } = await import('./client-ip');
const { authenticateApi, resolvePlayerToken, rotateSecretApiKey, revokePreviousSecretApiKey, PLAYER_TOKEN_IDLE_TTL_MS } = await import('./api-key');
const delivery = await import('./delivery');
const L = await import('./linking');
const W = await import('./webhook-secrets');
const { getRateLimitStore } = await import('./rate-limit');
const { createEventBus } = await import('./events');
const actions = await import('@/app/studio/games/[id]/integration/actions');
const linkCodesRoute = await import('@/app/api/v1/link-codes/route');
const linkRequestsRoute = await import('@/app/api/v1/link-requests/[id]/route');
const streamRoute = await import('@/app/api/v1/deliveries/stream/route');

const SECRET = 'das_secret_s_game';
const PUB = 'das_pub_s_game';
let ipSeq = 0;

function req(path: string, init: { method?: string; key?: string; token?: string; body?: unknown; ip?: string; signal?: AbortSignal } = {}) {
  const headers: Record<string, string> = { 'x-forwarded-for': init.ip ?? `198.18.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}` };
  if (init.key) headers.authorization = `Bearer ${init.key}`;
  if (init.token) headers['devappstore-player-token'] = init.token;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`http://devappstore.test${path}`, {
    method: init.method ?? 'GET', headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined, signal: init.signal,
  });
}
const game = async (id: string) => (await db.select().from(D.games).where(D.eq(D.games.id, id)))[0]!;
const newCode = async (key: string, playerId: string) => {
  const res = await linkCodesRoute.POST(req('/api/v1/link-codes', { method: 'POST', key, body: { player_id: playerId } }));
  return { status: res.status, body: (await res.json()) as { code: string; link_request_id: string } };
};

let hookServer: Server;
let hookUrl = '';
const hooks: { body: string; signature: string }[] = [];

beforeAll(async () => {
  hookServer = createServer((r, res) => {
    let body = '';
    r.on('data', (c) => (body += c));
    r.on('end', () => {
      hooks.push({ body, signature: String(r.headers['devappstore-signature'] ?? '') });
      res.writeHead(200).end('ok');
    });
  });
  await new Promise<void>((r) => hookServer.listen(0, '127.0.0.1', r));
  hookUrl = `http://127.0.0.1:${(hookServer.address() as AddressInfo).port}/hook`;

  await db.insert(D.user).values(['usr_owner', 'usr_victim', 'usr_evil', 'usr_dev', 'usr_fresh', 'usr_s1', 'usr_s2'].map((id) => ({ id, name: id, email: `${id}@s.test`, emailVerified: true })));
  await db.insert(D.studios).values({ id: 'std_s', name: 'S', slug: 's' });
  const g = (id: string, secret: string, pub: string, extra: Partial<typeof D.games.$inferInsert> = {}) => ({
    id, studioId: 'std_s', slug: id, name: id, theme: DEFAULT_THEME, status: 'live' as const, linkMethods: ['code' as const],
    webhookSecret: `whsec_${id}`, apiKeyHash: hashApiKey(secret), apiKeyPrefix: secret.slice(0, 15), publishableKey: pub, ...extra,
  });
  await db.insert(D.games).values([
    g('gam_s', SECRET, PUB),
    g('gam_q', 'das_secret_q_game', 'das_pub_q_game'),
    g('gam_t', 'das_secret_t_game', 'das_pub_t_game'),
    g('gam_h', 'das_secret_h_game', 'das_pub_h_game', { webhookUrl: hookUrl }),
    g('gam_k', 'das_secret_k_game', 'das_pub_k_game'),
  ]);
  await db.insert(D.items).values({ id: 'itm_s', gameId: 'gam_s', productId: 'gems', title: 'G', priceCents: 199, style: {} as never });
}, 60_000);

afterAll(async () => {
  await new Promise((r) => hookServer.close(r));
});

/* ------------------------------------------------------------------------------------------------ */

describe('F3 / A-05 — IP du client (utilitaire unique)', () => {
  const h = (xff?: string, real?: string) => new Headers({ ...(xff ? { 'x-forwarded-for': xff } : {}), ...(real ? { 'x-real-ip': real } : {}) });
  it('prend la n-ième valeur en partant de la droite (valeurs de gauche falsifiables ignorées)', () => {
    expect(clientIp(h('6.6.6.6, 203.0.113.7'), 1)).toBe('203.0.113.7');
    expect(clientIp(h('6.6.6.6, 203.0.113.7, 10.0.0.2'), 2)).toBe('203.0.113.7');
    expect(clientIp(h('203.0.113.7'), 3)).toBe('203.0.113.7');
  });
  it('X-Real-IP sans X-Forwarded-For ; 0 proxy ⇒ en-têtes ignorés ; valeur non IP ⇒ unknown', () => {
    expect(clientIp(h(undefined, '198.51.100.4'), 1)).toBe('198.51.100.4');
    expect(clientIp(h('203.0.113.7'), 0)).toBe('unknown');
    expect(clientIp(h('pas-une-ip'), 1)).toBe('unknown');
    expect(clientIp(h('[2001:db8::1]:443'), 1)).toBe('2001:db8::1');
    expect(clientIp(h('203.0.113.7:5555'), 1)).toBe('203.0.113.7');
  });
  it('TRUSTED_PROXY_HOPS : défaut 1, valeur invalide refusée', () => {
    expect(trustedProxyHops({})).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: '2' })).toBe(2);
    expect(() => trustedProxyHops({ TRUSTED_PROXY_HOPS: 'beaucoup' })).toThrow(/TRUSTED_PROXY_HOPS/);
  });
  it('un X-Forwarded-For changé à chaque requête ne contourne plus la limite par IP de link-codes', async () => {
    let last = 0;
    for (let i = 0; i < 25; i++) {
      const res = await linkCodesRoute.POST(req('/', { method: 'POST', key: 'das_pub_k_game', body: { player_id: `p${i}` }, ip: `10.${i}.0.1, 203.0.113.200` }));
      last = res.status;
    }
    expect(last).toBe(429);
  });
});

describe('F1 — codes de liaison : la clé publique ne bloque ni n’invalide les codes du studio', () => {
  it('un code public pour le même player_id n’invalide pas le code émis par le serveur du studio', async () => {
    const legit = await newCode(SECRET, 'victim_42');
    expect((await newCode(PUB, 'victim_42')).status).toBe(200);
    const r = await L.redeemLinkCode('usr_victim', await game('gam_s'), legit.body.code);
    expect(r.ok).toBe(true);
  });
  it('les codes publics ne s’invalident pas entre eux (pas d’expiration ciblée)', async () => {
    const first = await newCode(PUB, 'victim_43');
    await newCode(PUB, 'victim_43');
    const r = await L.redeemLinkCode('usr_victim', await game('gam_s'), first.body.code, { confirmed: true });
    expect(r.ok).toBe(true);
  });
  it('le quota public épuisé n’empêche pas le serveur du studio d’émettre des codes', async () => {
    const g = await game('gam_q');
    const { max } = L.LINK_LIMITS.codesPerGamePublishable;
    const now = new Date();
    await db.insert(D.linkCodes).values(
      Array.from({ length: max }, (_, i) => ({ id: `lnc_q${i}`, gameId: 'gam_q', playerId: `junk${i}`, code: `Q${String(i).padStart(3, '0')}-QQQQ`, expiresAt: new Date(now.getTime() + 600_000), createdAt: now, source: 'publishable' as const })),
    );
    expect(await L.createLinkCode(g, { playerId: 'x' }, { source: 'publishable' })).toMatchObject({ ok: false, error: 'rate_limited' });
    expect((await L.createLinkCode(g, { playerId: 'honest' }, { source: 'secret' })).ok).toBe(true);
  });
});

describe('F11 — confirmation explicite pour un code demandé avec la clé publique', () => {
  it('sans confirmation : rien n’est consommé ni lié ; avec : lien déclaratif', async () => {
    const { body } = await newCode(PUB, 'scammer_1');
    const g = await game('gam_s');
    const first = await L.redeemLinkCode('usr_victim', g, body.code);
    expect(first).toMatchObject({ ok: false, error: 'confirmation_required', candidate: { playerId: 'scammer_1' } });
    const [row] = await db.select().from(D.linkCodes).where(D.eq(D.linkCodes.code, body.code));
    expect(row!.consumedAt).toBeNull();
    const ok = await L.redeemLinkCode('usr_victim', g, body.code, { confirmed: true });
    expect(ok.ok && ok.link).toMatchObject({ playerId: 'scammer_1', verified: 0 });
  });
  it('un code émis par le serveur du studio est lié sans étape supplémentaire', async () => {
    const { body } = await newCode(SECRET, 'server_player');
    expect((await L.redeemLinkCode('usr_owner', await game('gam_s'), body.code)).ok).toBe(true);
  });
});

describe('F10 — limites par IP de la saisie de codes et des recherches id_confirm', () => {
  it('au-delà de codeAttemptsPerIp, refus même avec un autre compte', async () => {
    const g = await game('gam_s');
    const ip = '203.0.113.77';
    const { max } = L.LINK_LIMITS.codeAttemptsPerIp;
    const users = ['usr_owner', 'usr_victim', 'usr_evil', 'usr_dev'];
    for (let i = 0; i < max; i++) await L.redeemLinkCode(users[i % 4]!, g, `ZZZZ-Z${String(i).padStart(3, '0')}`, { ip, confirmed: true });
    const { body } = await newCode(SECRET, 'p_ip');
    // Compte neuf (aucun échec à son nom) : seul le plafond par IP le bloque.
    expect(await L.redeemLinkCode('usr_fresh', g, body.code, { ip })).toMatchObject({ ok: false, error: 'rate_limited' });
    expect((await L.redeemLinkCode('usr_fresh', g, body.code, { ip: '203.0.113.78' })).ok).toBe(true);
  });
  it('recherche id_confirm refusée au-delà de lookupsPerIp, avant tout appel sortant', async () => {
    const ip = '203.0.113.90';
    const rule = L.LINK_LIMITS.lookupsPerIp;
    for (let i = 0; i < rule.max; i++) await getRateLimitStore().hit(`link:lookup:ip:${ip}`, rule);
    const g = { id: 'gam_s', linkMethods: ['id_confirm' as const], playerLookupUrl: 'https://lookup.invalid/{player_id}', webhookSecret: 'whsec_x' };
    expect(await L.startIdConfirm('usr_dev', g, 'joueur', { ip })).toMatchObject({ ok: false, error: 'rate_limited' });
  });
});

describe('F2 — places de flux SSE par origine', () => {
  it('les flux d’un tiers sur le player_id de la victime ne bloquent ni la clé secrète ni le compte légitime', async () => {
    const tokenFor = async (userId: string) => {
      const { body } = await newCode('das_pub_t_game', 'star');
      expect((await L.redeemLinkCode(userId, await game('gam_t'), body.code, { confirmed: true })).ok).toBe(true);
      const res = await linkRequestsRoute.GET(req('/', { key: 'das_pub_t_game' }), { params: Promise.resolve({ id: body.link_request_id }) });
      return ((await res.json()) as { player_token: string }).player_token;
    };
    const evil = await tokenFor('usr_s1');
    const ctrls: AbortController[] = [];
    const open = (init: { key: string; token?: string; path?: string }) => {
      const c = new AbortController();
      ctrls.push(c);
      return streamRoute.GET(req(init.path ?? '/api/v1/deliveries/stream', { ...init, signal: c.signal }));
    };
    for (let i = 0; i < 3; i++) expect((await open({ key: 'das_pub_t_game', token: evil })).status).toBe(200);
    expect((await open({ key: 'das_pub_t_game', token: evil })).status).toBe(429);
    expect((await open({ key: 'das_secret_t_game', path: '/api/v1/deliveries/stream?player_id=star' })).status).toBe(200);
    const victim = await tokenFor('usr_s2');
    expect((await open({ key: 'das_pub_t_game', token: victim })).status).toBe(200);
    for (const c of ctrls) c.abort();
  });
});

describe('F4 — ack d’un achat arrêté', () => {
  it('une livraison arrêtée pour rétractation reste failed (ack sans effet)', async () => {
    await db.insert(D.orders).values({
      id: 'ord_w', userId: 'usr_victim', gameId: 'gam_s', itemId: 'itm_s', productId: 'gems', itemTitle: 'G', playerId: 'p_w',
      amountCents: 199, platformFeeCents: 10, currency: 'EUR', status: 'paid', paidAt: new Date(),
    });
    const id = await delivery.enqueueDelivery('ord_w');
    await db.update(D.deliveries).set({ status: 'failed', nextAttemptAt: null, lastError: delivery.WITHDRAWAL_STOP_REASON }).where(D.eq(D.deliveries.id, id));
    expect(await delivery.acknowledgeDelivery('gam_s', id)).toBe('ok');
    expect((await db.select().from(D.deliveries).where(D.eq(D.deliveries.id, id)))[0]!.status).toBe('failed');
    await db.update(D.deliveries).set({ lastError: null }).where(D.eq(D.deliveries.id, id));
    await db.update(D.orders).set({ status: 'refunded' }).where(D.eq(D.orders.id, 'ord_w'));
    expect(await delivery.acknowledgeDelivery('gam_s', id)).toBe('ok');
    expect((await db.select().from(D.deliveries).where(D.eq(D.deliveries.id, id)))[0]!.status).toBe('failed');
  });
});

describe('F5 — séparation de domaine des signatures lookup / webhook', () => {
  it('une signature de lookup ne vérifie jamais comme signature de webhook du même texte', () => {
    const t = Math.floor(Date.now() / 1000);
    const header = signLookup('{"event":"x"}', 'whsec_k', t);
    expect(verifyLookupSignature('{"event":"x"}', header, 'whsec_k', t)).toBe(true);
    expect(verifySignature('{"event":"x"}', header, 'whsec_k', t)).toBe(false);
  });
});

describe('F6 — garde SSRF : préfixes IPv6 spéciaux', () => {
  it.each(['::ffff:0:127.0.0.1', '::ffff:0:a9fe:a9fe', '64:ff9b:1::7f00:1', '2001:20::1', '2001:10::1'])('%s bloquée', (ip) => {
    expect(L.isBlockedAddress(ip)).toBe(true);
  });
  it.each(['2606:4700::1111', '8.8.8.8'])('%s autorisée', (ip) => {
    expect(L.isBlockedAddress(ip)).toBe(false);
  });
});

describe('F7 — secret webhook chiffré au repos, rotation avec recouvrement', () => {
  it('chiffrement lié au jeu ; valeur historique en clair lue puis chiffrée au premier usage', async () => {
    const sealed = W.sealWebhookSecret('gam_h', 'whsec_abc');
    expect(sealed).toMatch(/^enc:v1:/);
    expect(sealed).not.toContain('whsec_abc');
    expect(W.openWebhookSecret('gam_h', sealed)).toBe('whsec_abc');
    expect(() => W.openWebhookSecret('gam_autre', sealed)).toThrow();
    expect((await W.loadWebhookSecrets('gam_h'))?.current).toBe('whsec_gam_h');
    expect((await game('gam_h')).webhookSecret).toMatch(/^enc:v1:/);
  });
  it('après rotation, chaque envoi porte deux v1 (nouveau et ancien) ; rotation immédiate : un seul', async () => {
    const fresh = (await W.rotateWebhookSecret('gam_h'))!;
    hooks.length = 0;
    expect((await delivery.sendTestWebhook('gam_h')).ok).toBe(true);
    const { body, signature } = hooks[0]!;
    expect(signature.match(/v1=/g)).toHaveLength(2);
    expect(verifySignature(body, signature, fresh)).toBe(true);
    expect(verifySignature(body, signature, 'whsec_gam_h')).toBe(true);

    const urgent = (await W.rotateWebhookSecret('gam_h', { overlapMs: 0 }))!;
    hooks.length = 0;
    await delivery.sendTestWebhook('gam_h');
    expect(hooks[0]!.signature.match(/v1=/g)).toHaveLength(1);
    expect(verifySignature(hooks[0]!.body, hooks[0]!.signature, urgent)).toBe(true);
    expect(verifySignature(hooks[0]!.body, hooks[0]!.signature, fresh)).toBe(false);
  });
  it('l’ancien secret ne signe plus après la période de recouvrement', async () => {
    await W.rotateWebhookSecret('gam_h');
    await db.update(D.games).set({ webhookSecretPreviousExpiresAt: new Date(Date.now() - 1000) }).where(D.eq(D.games.id, 'gam_h'));
    expect((await W.loadWebhookSecrets('gam_h'))!.previous).toEqual([]);
  });
});

describe('F9 — rotation de la clé secrète sans coupure', () => {
  const auth = (key: string) => authenticateApi(new Request('http://x/', { headers: { authorization: `Bearer ${key}` } }));
  it('ancienne clé acceptée pendant le recouvrement, refusée après expiration ou révocation ; last_used_at', async () => {
    const r = (await rotateSecretApiKey('gam_k'))!;
    expect((await auth(r.key))?.game.id).toBe('gam_k');
    expect((await auth('das_secret_k_game'))?.game.id).toBe('gam_k');
    const g = await game('gam_k');
    expect(g.apiKeyLastUsedAt).not.toBeNull();
    expect(g.apiKeyPreviousLastUsedAt).not.toBeNull();
    await db.update(D.games).set({ apiKeyPreviousExpiresAt: new Date(Date.now() - 1000) }).where(D.eq(D.games.id, 'gam_k'));
    expect(await auth('das_secret_k_game')).toBeNull();

    const r2 = (await rotateSecretApiKey('gam_k'))!;
    expect((await auth(r.key))?.game.id).toBe('gam_k');
    expect(await revokePreviousSecretApiKey('gam_k')).toBe(true);
    expect(await auth(r.key)).toBeNull();
    expect((await auth(r2.key))?.game.id).toBe('gam_k');
  });
  it('rotation immédiate (fuite) : l’ancienne clé est refusée tout de suite', async () => {
    const before = (await rotateSecretApiKey('gam_k', { overlapMs: 0 }))!;
    const after = (await rotateSecretApiKey('gam_k', { overlapMs: 0 }))!;
    expect(await auth(before.key)).toBeNull();
    expect((await auth(after.key))?.game.id).toBe('gam_k');
  });
});

describe('F12 — expiration glissante des jetons joueur', () => {
  it('un jeton inutilisé depuis plus de 90 jours est refusé ; l’usage le prolonge', async () => {
    const now = new Date();
    const old = new Date(now.getTime() - PLAYER_TOKEN_IDLE_TTL_MS - 60_000);
    await db.insert(D.playerTokens).values([
      { id: 'ptk_old', gameId: 'gam_s', playerId: 'p', userId: 'usr_victim', tokenHash: hashApiKey('das_pt_old'), createdAt: old, lastUsedAt: old },
      { id: 'ptk_used', gameId: 'gam_s', playerId: 'p', userId: 'usr_victim', tokenHash: hashApiKey('das_pt_used'), createdAt: old, lastUsedAt: new Date(now.getTime() - 3600_000) },
    ]);
    expect(await resolvePlayerToken('gam_s', 'das_pt_old', now)).toBeNull();
    expect((await resolvePlayerToken('gam_s', 'das_pt_used', now))?.tokenId).toBe('ptk_used');
  });
});

describe('F8 / A-08 — rôles et journal d’audit de l’intégration', () => {
  const audit = async (gameId: string) => db.select().from(D.integrationAuditLog).where(D.eq(D.integrationAuditLog.gameId, gameId));
  it('le rôle developer ne fait tourner ni la clé secrète, ni le secret webhook, ni la clé publique, ni l’URL', async () => {
    Object.assign(session, { role: 'developer', userId: 'usr_dev' });
    for (const r of [
      await actions.regenerateApiKey('gam_s'),
      await actions.regenerateWebhookSecret('gam_s'),
      await actions.regeneratePublishableKey('gam_s'),
      await actions.updateWebhookUrl('gam_s', 'https://hooks.example.com/x'),
      await actions.revokePreviousApiKey('gam_s'),
    ]) {
      expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/propriétaires et administrateurs/) });
    }
    // Il garde l'affichage du secret (journalisé) et les actions courantes.
    expect((await actions.revealWebhookSecret('gam_s')).ok).toBe(true);
    expect((await audit('gam_s')).map((a) => a.action)).toEqual(['webhook_secret.revealed']);
  });
  it('owner : rotations et changement d’URL journalisés, sans secret ni query string', async () => {
    Object.assign(session, { role: 'owner', userId: 'usr_owner' });
    const key = await actions.regenerateApiKey('gam_s');
    expect(key.ok).toBe(true);
    expect((await actions.regenerateWebhookSecret('gam_s', { immediate: true })).ok).toBe(true);
    expect((await actions.updateWebhookUrl('gam_s', `${hookUrl}?token=secret123`)).ok).toBe(true);
    const rows = await audit('gam_s');
    expect(rows.map((a) => a.action).sort()).toEqual(['secret_key.rotated', 'webhook_secret.revealed', 'webhook_secret.rotated', 'webhook_url.updated']);
    const json = JSON.stringify(rows);
    expect(json).not.toContain('secret123');
    expect(json).not.toContain(key.ok ? key.apiKey : 'x');
    expect(rows.find((a) => a.action === 'webhook_url.updated')!.details).toMatchObject({ from: null, to: hookUrl });
  });
});

describe('F13 — rattrapage multi-instance étalé', () => {
  it('avec resyncJitterMs, les abonnés sont rappelés après un délai, pas tous au même instant', async () => {
    vi.useFakeTimers();
    try {
      let onReady: ((i: { reconnect: boolean }) => void) | undefined;
      const bus = createEventBus({
        resyncJitterMs: 1000,
        transport: { kind: 'memory', listen: async (_c, _f, o) => ((onReady = o?.onReady), async () => {}), notify: async () => {}, close: async () => {} },
      });
      const calls: number[] = [];
      for (let i = 0; i < 20; i++) bus.subscribe('g', `p${i}`, () => {}, { onResync: () => calls.push(i) });
      await vi.advanceTimersByTimeAsync(0);
      calls.length = 0;
      onReady!({ reconnect: true });
      expect(calls).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toHaveLength(20);
      await bus.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
