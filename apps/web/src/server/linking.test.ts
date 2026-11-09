import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LINK_CODE_TTL_MS, hashApiKey, verifySignature } from '@wolleen/core';
import { createTestDb } from '@wolleen/db/testing';

vi.mock('server-only', () => ({}));

// Nom « public » qui résout vers 127.0.0.1 : simule un DNS rebinding sans dépendre du réseau.
const { REBIND_HOST } = vi.hoisted(() => ({ REBIND_HOST: 'rebind.wolleen.test' }));
vi.mock('node:dns', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:dns')>();
  type Cb = (err: NodeJS.ErrnoException | null, addresses: { address: string; family: number }[]) => void;
  const lookup = (host: string, opts: object, cb: Cb) =>
    host === REBIND_HOST ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : (real.lookup as unknown as (h: string, o: object, c: Cb) => void)(host, opts, cb);
  return { ...real, default: { ...real, lookup }, lookup };
});

// `@wolleen/db` crée sa base au chargement : on injecte la base en mémoire AVANT de l'importer (imports dynamiques).
let L: typeof import('./linking');
let D: typeof import('@wolleen/db');

const SECRET = 'whsec_test_lookup';
const T0 = new Date('2026-01-01T12:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

type GameRow = Awaited<ReturnType<typeof insertGame>>;
let gameA: GameRow;
let gameB: GameRow;
let gameLookup: GameRow;
let gameNoCode: GameRow;
let userSeq = 0;

async function insertGame(id: string, patch: Partial<typeof D.games.$inferInsert> = {}) {
  const [g] = await D.db
    .insert(D.games)
    .values({
      id, studioId: 'std_t', slug: id, name: `Jeu ${id}`, status: 'live',
      theme: { gradient: { enabled: false, c1: '#000', c2: '#fff', style: 'linear' }, grid: { width: 200, height: 260, margin: 24 } },
      linkMethods: ['code'], webhookSecret: SECRET, apiKeyHash: hashApiKey(`wk_${id}`), apiKeyPrefix: 'wk_test', ...patch,
    })
    .returning();
  return g;
}

async function newUser() {
  const id = `usr_t${++userSeq}`;
  await D.db.insert(D.user).values({ id, name: `U${userSeq}`, email: `${id}@t.test` });
  return id;
}

/* Faux serveur « player lookup » du studio. */
let server: Server;
let base = '';
const hits: { url: string; signature: string | undefined; valid: boolean }[] = [];

function startLookupServer() {
  server = createServer((req: IncomingMessage, res) => {
    const url = req.url ?? '/';
    const raw = decodeURIComponent(url.replace(/^\/players\//, ''));
    const signature = req.headers['wolleen-signature'] as string | undefined;
    hits.push({ url, signature, valid: verifySignature(raw, signature, SECRET, Math.floor(T0.getTime() / 1000)) });
    if (url.startsWith('/slow')) return; // ne répond jamais
    if (url.startsWith('/redirect')) {
      res.writeHead(302, { location: `${base}/players/P1` });
      return res.end();
    }
    if (url.startsWith('/big')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ player_id: 'X', display_name: 'x'.repeat(40_000) }));
    }
    if (url.startsWith('/bidi')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ player_id: 'B1', display_name: '‮etuor‬  Lina​<script>alert(1)</script>' }));
    }
    if (url.startsWith('/garbage')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('<html>pas du json</html>');
    }
    if (raw === 'unknown') {
      res.writeHead(404);
      return res.end();
    }
    if (raw === 'bad-shape') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ player_id: 'bad-shape' }));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ player_id: raw.toUpperCase(), display_name: `Héros ${raw}`, level: 42, avatar_url: 'javascript:alert(1)' }));
  });
  return new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    }),
  );
}

beforeAll(async () => {
  (globalThis as { __wolleenDb?: unknown }).__wolleenDb = await createTestDb();
  D = await import('@wolleen/db');
  L = await import('./linking');
  await startLookupServer();
  await D.db.insert(D.studios).values({ id: 'std_t', name: 'Studio T', slug: 'studio-t' });
  gameA = await insertGame('gam_a');
  gameB = await insertGame('gam_b');
  gameNoCode = await insertGame('gam_nocode', { linkMethods: ['id_confirm'], playerLookupUrl: 'http://127.0.0.1:1/{player_id}' });
  gameLookup = await insertGame('gam_lookup', { linkMethods: ['code', 'id_confirm'], playerLookupUrl: `${base}/players/{player_id}` });
}, 60_000);

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function issue(game: GameRow, playerId: string, now = T0) {
  const r = await L.createLinkCode(game, { playerId, playerName: `Nom ${playerId}` }, { now });
  if (!r.ok) throw new Error(r.message);
  return r;
}

describe('codes de liaison (API)', () => {
  it('émet un code lisible valable LINK_CODE_TTL_MS', async () => {
    const r = await issue(gameA, 'p-emit');
    expect(r.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(r.expiresAt.getTime()).toBe(T0.getTime() + LINK_CODE_TTL_MS);
  });

  it('invalide les codes non consommés précédents du même joueur', async () => {
    const user = await newUser();
    const first = await issue(gameA, 'p-renew');
    const second = await issue(gameA, 'p-renew', at(1000));
    expect((await L.redeemLinkCode(user, gameA, first.code, { now: at(2000) })).ok).toBe(false);
    expect((await L.redeemLinkCode(user, gameA, second.code, { now: at(2000) })).ok).toBe(true);
  });

  it('garantit un code unique par jeu (nouvel essai en cas de collision)', async () => {
    const seq = ['AAAA-AAAA', 'AAAA-AAAA', 'BBBB-BBBB'];
    const generate = () => seq.shift() ?? 'CCCC-CCCC';
    const r1 = await L.createLinkCode(gameB, { playerId: 'p-u1' }, { now: T0, generate });
    const r2 = await L.createLinkCode(gameB, { playerId: 'p-u2' }, { now: T0, generate });
    expect(r1.ok && r1.code).toBe('AAAA-AAAA');
    expect(r2.ok && r2.code).toBe('BBBB-BBBB');
    // Le même code reste possible dans un autre jeu.
    const r3 = await L.createLinkCode(gameA, { playerId: 'p-u3' }, { now: T0, generate: () => 'AAAA-AAAA' });
    expect(r3.ok && r3.code).toBe('AAAA-AAAA');
  });

  it('limite le débit par jeu', async () => {
    const g = await insertGame('gam_rate');
    const { max, windowMs } = L.LINK_LIMITS.codesPerGame;
    const now = at(10 * 3600_000);
    await D.db.insert(D.linkCodes).values(
      Array.from({ length: max }, (_, i) => ({
        id: `lnc_rate_${i}`, gameId: g.id, playerId: `p${i}`, code: `R${String(i).padStart(3, '0')}-ZZZZ`, expiresAt: at(11 * 3600_000), createdAt: now,
      })),
    );
    const blocked = await L.createLinkCode(g, { playerId: 'p-x' }, { now });
    expect(blocked).toMatchObject({ ok: false, error: 'rate_limited' });
    expect(!blocked.ok && blocked.retryAfterS).toBe(windowMs / 1000);
    expect((await L.createLinkCode(gameA, { playerId: 'p-x' }, { now })).ok).toBe(true); // autre jeu non affecté
    expect((await L.createLinkCode(g, { playerId: 'p-x' }, { now: new Date(now.getTime() + windowMs + 1) })).ok).toBe(true);
  });

  it('refuse si la méthode code est désactivée', async () => {
    expect(await L.createLinkCode(gameNoCode, { playerId: 'p' }, { now: T0 })).toMatchObject({ ok: false, error: 'method_disabled' });
    const user = await newUser();
    expect(await L.redeemLinkCode(user, gameNoCode, 'AAAA-AAAA', { now: T0 })).toMatchObject({ ok: false, error: 'method_disabled' });
  });
});

describe('saisie du code par le joueur', () => {
  it('crée un lien vérifié et accepte une saisie approximative', async () => {
    const user = await newUser();
    const { code } = await issue(gameA, 'p-ok');
    const r = await L.redeemLinkCode(user, gameA, ` ${code.toLowerCase().replace('-', ' ')} `, { now: at(1000) });
    expect(r.ok).toBe(true);
    const [link] = await D.db.select().from(D.gameLinks).where(D.and(D.eq(D.gameLinks.userId, user), D.eq(D.gameLinks.gameId, gameA.id)));
    expect(link).toMatchObject({ playerId: 'p-ok', playerName: 'Nom p-ok', method: 'code', verified: 1 });
  });

  it('refuse la double consommation (même utilisateur ou un autre)', async () => {
    const [u1, u2] = [await newUser(), await newUser()];
    const { code } = await issue(gameA, 'p-double');
    expect((await L.redeemLinkCode(u1, gameA, code, { now: at(1000) })).ok).toBe(true);
    expect(await L.redeemLinkCode(u2, gameA, code, { now: at(2000) })).toMatchObject({ ok: false, error: 'invalid_code' });
    expect(await L.redeemLinkCode(u1, gameA, code, { now: at(3000) })).toMatchObject({ ok: false, error: 'invalid_code' });
    expect(await D.db.select().from(D.gameLinks).where(D.eq(D.gameLinks.userId, u2))).toHaveLength(0);
  });

  it('une seule consommation même en parallèle', async () => {
    const users = await Promise.all([newUser(), newUser(), newUser()]);
    const { code } = await issue(gameA, 'p-race');
    const results = await Promise.all(users.map((u) => L.redeemLinkCode(u, gameA, code, { now: at(1000) })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('refuse un code expiré', async () => {
    const user = await newUser();
    const { code } = await issue(gameA, 'p-exp');
    expect(await L.redeemLinkCode(user, gameA, code, { now: at(LINK_CODE_TTL_MS) })).toMatchObject({ ok: false, error: 'invalid_code' });
    expect((await L.redeemLinkCode(user, gameA, code, { now: at(LINK_CODE_TTL_MS - 1) })).ok).toBe(true);
  });

  it("refuse un code émis par un autre jeu (et ne le consomme pas)", async () => {
    const user = await newUser();
    const { code } = await issue(gameA, 'p-wrong-game');
    expect(await L.redeemLinkCode(user, gameB, code, { now: at(1000) })).toMatchObject({ ok: false, error: 'invalid_code' });
    expect((await L.redeemLinkCode(user, gameA, code, { now: at(2000) })).ok).toBe(true);
  });

  it('rejette un format invalide sans compter de tentative', async () => {
    const user = await newUser();
    expect(await L.redeemLinkCode(user, gameA, 'abc', { now: T0 })).toMatchObject({ ok: false, error: 'invalid_format' });
    expect(await D.db.select().from(D.linkAttempts).where(D.eq(D.linkAttempts.userId, user))).toHaveLength(0);
  });

  it('bloque la force brute par utilisateur, tous jeux confondus', async () => {
    const user = await newUser();
    const other = await newUser();
    const { max, windowMs } = L.LINK_LIMITS.codeFailuresPerUser;
    const { code } = await issue(gameA, 'p-brute', at(-60_000));
    for (let i = 0; i < max; i++) {
      const r = await L.redeemLinkCode(user, i % 2 ? gameA : gameB, `ZZZZ-ZZZ${i + 2}`, { now: at(i * 1000) });
      expect(r).toMatchObject({ ok: false, error: 'invalid_code', remaining: max - i - 1 });
    }
    // Même le bon code est refusé pendant le blocage, et il n'est pas consommé.
    const blocked = await L.redeemLinkCode(user, gameA, code, { now: at(max * 1000) });
    expect(blocked).toMatchObject({ ok: false, error: 'rate_limited' });
    expect(!blocked.ok && blocked.retryAfterS).toBeGreaterThan(0);
    // Un autre utilisateur n'est pas affecté.
    const { code: code2 } = await issue(gameB, 'p-brute-2');
    expect((await L.redeemLinkCode(other, gameB, code2, { now: at(max * 1000) })).ok).toBe(true);
    // Après la fenêtre (la 1re erreur sort de la fenêtre glissante), on peut réessayer.
    const fresh = await issue(gameA, 'p-brute', at(windowMs));
    expect((await L.redeemLinkCode(user, gameA, fresh.code, { now: at(windowMs + 1) })).ok).toBe(true);
  });

  it('« Changer de compte » remplace le lien existant', async () => {
    const user = await newUser();
    const c1 = await issue(gameA, 'p-old');
    const c2 = await issue(gameA, 'p-new');
    await L.redeemLinkCode(user, gameA, c1.code, { now: at(1000) });
    await L.redeemLinkCode(user, gameA, c2.code, { now: at(2000) });
    const links = await D.db.select().from(D.gameLinks).where(D.eq(D.gameLinks.userId, user));
    expect(links).toHaveLength(1);
    expect(links[0].playerId).toBe('p-new');
  });
});

describe('protection SSRF', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.5.4', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1',
    '::ffff:7f00:1', '::ffff:a9fe:a9fe', '64:ff9b::a9fe:a9fe', '2002:7f00:1::', 'pas-une-ip',
  ])('bloque %s', (ip) => expect(L.isBlockedAddress(ip)).toBe(true));

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('autorise %s', (ip) =>
    expect(L.isBlockedAddress(ip)).toBe(false),
  );

  it.each([
    ['ftp://example.com/{x}', true],
    ['file:///etc/passwd', true],
    ['http://user:pass@example.com/', true],
    ['http://127.0.0.1:4100/', false],
    ['http://localhost:4100/', false],
    ['http://[::1]/', false],
    ['http://2130706433/', false], // 127.0.0.1 en décimal
    ['http://0x7f.1/', false],
    ['http://intranet/', false],
    ['http://metadata.localhost/', false],
  ])('refuse %s (production)', (url, alsoInDev) => {
    expect(L.checkOutboundUrl(url, false).ok).toBe(false);
    expect(L.checkOutboundUrl(url, true).ok).toBe(!alsoInDev);
  });

  it('accepte une URL publique https', () => {
    expect(L.checkOutboundUrl('https://api.example.com/players/abc', false).ok).toBe(true);
  });

  it("n'appelle pas une IP interne en production", async () => {
    const before = hits.length;
    const r = await L.fetchPlayerLookup({ playerLookupUrl: `${base}/players/{player_id}`, webhookSecret: SECRET }, 'P1', { allowPrivate: false, now: T0 });
    expect(r).toMatchObject({ ok: false, error: 'unsafe_url' });
    expect(hits.length).toBe(before);
  });

  it('vérifie les adresses résolues au moment de la connexion (nom public → loopback, DNS rebinding)', async () => {
    const url = new URL(`${base.replace('127.0.0.1', REBIND_HOST)}/players/P1`);
    expect(L.checkOutboundUrl(url.href, false).ok).toBe(true); // passe la vérification statique…
    const before = hits.length;
    await expect(L.safeHttpGet(url, {}, { allowPrivate: false, timeoutMs: 2000, maxBytes: 1024 })).rejects.toBeInstanceOf(L.BlockedAddressError);
    expect(hits.length).toBe(before); // …mais la connexion n'a jamais lieu
    // Témoin : la résolution protégée est bien celle utilisée par la requête.
    await expect(L.safeHttpGet(url, {}, { allowPrivate: true, timeoutMs: 2000, maxBytes: 1024 })).resolves.toMatchObject({ status: 200 });
    expect(hits.length).toBe(before + 1);
  });
});

describe('confirmation par identifiant (id_confirm)', () => {
  it('appelle le lookup signé (ID encodé), puis crée un lien déclaratif', async () => {
    const user = await newUser();
    const before = hits.length;
    const r = await L.startIdConfirm(user, gameLookup, '  #2pp 8ql9 ', { now: T0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.player).toEqual({ player_id: '#2PP 8QL9', display_name: 'Héros #2pp 8ql9', level: 42 }); // avatar non http(s) ignoré
    const hit = hits[before];
    expect(hit.url).toBe('/players/%232pp%208ql9');
    expect(hit.valid).toBe(true);
    expect(hit.signature).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);

    const c = await L.confirmIdLink(user, gameLookup, r.attemptId, { now: at(30_000) });
    expect(c.ok && c.link).toMatchObject({ playerId: '#2PP 8QL9', playerName: 'Héros #2pp 8ql9', method: 'id_confirm', verified: 0 });
    // Jeton à usage unique.
    expect(await L.confirmIdLink(user, gameLookup, r.attemptId, { now: at(31_000) })).toMatchObject({ ok: false, error: 'expired' });
  });

  it("refuse la confirmation par un autre utilisateur, sur un autre jeu ou après expiration", async () => {
    const [user, intruder] = [await newUser(), await newUser()];
    const r = await L.startIdConfirm(user, gameLookup, 'P2', { now: T0 });
    if (!r.ok) throw new Error(r.message);
    expect(await L.confirmIdLink(intruder, gameLookup, r.attemptId, { now: at(1000) })).toMatchObject({ ok: false, error: 'expired' });
    expect(await L.confirmIdLink(user, gameNoCode, r.attemptId, { now: at(1000) })).toMatchObject({ ok: false, error: 'expired' });
    expect(await L.confirmIdLink(user, gameLookup, r.attemptId, { now: at(L.LINK_LIMITS.lookupConfirmTtlMs + 1) })).toMatchObject({ ok: false, error: 'expired' });
  });

  it('gère joueur inconnu, réponse invalide, redirection, délai et taille', async () => {
    const user = await newUser();
    expect(await L.startIdConfirm(user, gameLookup, 'unknown', { now: T0 })).toMatchObject({ ok: false, error: 'player_not_found' });
    expect(await L.startIdConfirm(user, gameLookup, 'bad-shape', { now: T0 })).toMatchObject({ ok: false, error: 'invalid_response' });
    const lookup = (path: string, timeoutMs = 2000) =>
      L.fetchPlayerLookup({ playerLookupUrl: `${base}${path}`, webhookSecret: SECRET }, 'P1', { allowPrivate: true, timeoutMs, now: T0 });
    expect(await lookup('/garbage/{player_id}')).toMatchObject({ ok: false, error: 'invalid_response' });
    const before = hits.length;
    expect(await lookup('/redirect/{player_id}')).toMatchObject({ ok: false, error: 'lookup_failed' });
    expect(hits.length).toBe(before + 1); // redirection non suivie
    expect(await lookup('/big/{player_id}')).toMatchObject({ ok: false, error: 'lookup_failed' });
    const t = Date.now();
    expect(await lookup('/slow/{player_id}', 300)).toMatchObject({ ok: false, error: 'lookup_failed' });
    expect(Date.now() - t).toBeLessThan(2000);
    expect(await lookup('/players')).toMatchObject({ ok: false, error: 'not_configured' });
  });

  it("valide l'identifiant saisi et la méthode", async () => {
    const user = await newUser();
    expect(await L.startIdConfirm(user, gameLookup, '   ', { now: T0 })).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(await L.startIdConfirm(user, gameLookup, 'a\u0000b', { now: T0 })).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(await L.startIdConfirm(user, gameA, 'P1', { now: T0 })).toMatchObject({ ok: false, error: 'method_disabled' });
  });

  it('limite les recherches par utilisateur (anti énumération)', async () => {
    const user = await newUser();
    const { max, windowMs } = L.LINK_LIMITS.lookupsPerUser;
    for (let i = 0; i < max; i++) await L.startIdConfirm(user, gameLookup, i % 2 ? 'unknown' : `P${i}`, { now: at(i * 1000) });
    const before = hits.length;
    expect(await L.startIdConfirm(user, gameLookup, 'P99', { now: at(max * 1000) })).toMatchObject({ ok: false, error: 'rate_limited' });
    expect(hits.length).toBe(before);
    expect((await L.startIdConfirm(user, gameLookup, 'P99', { now: at(windowMs + 1000) })).ok).toBe(true);
  });
});

describe('pages joueur et réglages studio', () => {
  it('construit la destination après liaison', async () => {
    const [item] = await D.db
      .insert(D.items)
      .values({ id: 'itm_a_gems', gameId: gameA.id, productId: 'gems', title: 'Gemmes', priceCents: 499, style: {} as never })
      .returning();
    expect(await L.linkReturnPath(gameA, item.id)).toBe('/games/gam_a?buy=itm_a_gems');
    expect(await L.linkReturnPath(gameB, item.id)).toBe('/games/gam_b');
    expect(await L.linkReturnPath(gameA, 'itm_inconnu')).toBe('/games/gam_a');
    expect(await L.linkReturnPath(gameA)).toBe('/games/gam_a');
  });

  it('liste et délie uniquement ses propres liens', async () => {
    const [owner, other] = [await newUser(), await newUser()];
    const { code } = await issue(gameB, 'p-list');
    const r = await L.redeemLinkCode(owner, gameB, code, { now: at(1000) });
    if (!r.ok) throw new Error(r.message);
    const list = await L.listUserGameLinks(owner);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ gameName: 'Jeu gam_b', playerId: 'p-list', method: 'code' });
    expect(await L.unlinkGameLink(other, r.link.id)).toBe(false);
    expect(await L.unlinkGameLink(owner, r.link.id)).toBe(true);
    expect(await L.listUserGameLinks(owner)).toHaveLength(0);
  });

  it('masque les jeux non publiés sauf pour les membres du studio', async () => {
    const dev = await newUser();
    const player = await newUser();
    await D.db.insert(D.studioMembers).values({ studioId: 'std_t', userId: dev, role: 'developer' });
    await insertGame('gam_draft', { status: 'draft' });
    expect(await L.getLinkableGame('gam_draft', player)).toBeNull();
    expect((await L.getLinkableGame('gam_draft', dev))?.id).toBe('gam_draft');
    expect(await L.getLinkableGame('inexistant', dev)).toBeNull();
  });

  it('valide les réglages de liaison', async () => {
    const g = await insertGame('gam_settings');
    const save = (methods: string[], playerLookupUrl: string, allowPrivate = false) => L.updateLinkSettings(g.id, { methods, playerLookupUrl }, { allowPrivate });
    expect(await save([], '')).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(await save(['id_confirm'], '')).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(await save(['id_confirm'], 'https://api.example.com/players')).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(await save(['id_confirm'], 'http://10.0.0.5/players/{player_id}')).toMatchObject({ ok: false, error: 'unsafe_url' });
    expect(await save(['id_confirm'], 'gopher://example.com/{player_id}')).toMatchObject({ ok: false, error: 'unsafe_url' });
    // En dev, localhost est autorisé (démo sur :4100) ; oauth (phase 2) est ignoré.
    expect(await save(['code', 'id_confirm', 'oauth'], ' http://localhost:4100/wolleen/players/{player_id} ', true)).toMatchObject({
      ok: true, linkMethods: ['code', 'id_confirm'], playerLookupUrl: 'http://localhost:4100/wolleen/players/{player_id}',
    });
    expect(await L.getLinkSettings(g.id)).toMatchObject({ linkMethods: ['code', 'id_confirm'] });
    expect(await save(['code'], '')).toMatchObject({ ok: true, playerLookupUrl: null });
    expect(L.availableLinkMethods({ linkMethods: ['code', 'id_confirm', 'oauth'], playerLookupUrl: null })).toEqual(['code']);
  });
});

/* ------------------------------------------------------------------------------------------------ */
/* Revue de sécurité (vague 2) — tests de non-régression                                             */
/* ------------------------------------------------------------------------------------------------ */

const WRONG_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
/** Codes bien formés mais inexistants (« YYYY-YYAB », …). */
const wrongCode = (i: number) => `YYYY-YY${WRONG_ALPHABET[Math.floor(i / WRONG_ALPHABET.length) % WRONG_ALPHABET.length]}${WRONG_ALPHABET[i % WRONG_ALPHABET.length]}`;

describe('revue de sécurité — liaison', () => {
  it('CHK-LNK-03 : la limite des codes erronés tient sous des saisies parallèles (atomicité)', async () => {
    const user = await newUser();
    const { max } = L.LINK_LIMITS.codeFailuresPerUser;
    const { code } = await issue(gameA, 'p-par-brute');
    const results = await Promise.all(Array.from({ length: 4 * max }, (_, i) => L.redeemLinkCode(user, gameA, wrongCode(i), { now: at(1000) })));
    expect(results.filter((r) => !r.ok && r.error === 'invalid_code')).toHaveLength(max);
    expect(results.filter((r) => !r.ok && r.error === 'rate_limited')).toHaveLength(3 * max);
    const failures = await D.db
      .select()
      .from(D.linkAttempts)
      .where(D.and(D.eq(D.linkAttempts.userId, user), D.eq(D.linkAttempts.kind, 'code'), D.eq(D.linkAttempts.ok, 0)));
    expect(failures).toHaveLength(max);
    // Le bon code reste refusé pendant le blocage et n'est pas consommé.
    expect(await L.redeemLinkCode(user, gameA, code, { now: at(2000) })).toMatchObject({ ok: false, error: 'rate_limited' });
    const [row] = await D.db.select().from(D.linkCodes).where(D.and(D.eq(D.linkCodes.gameId, gameA.id), D.eq(D.linkCodes.playerId, 'p-par-brute')));
    expect(row.consumedAt).toBeNull();
  });

  it('CHK-LNK-07 : la limite des recherches tient sous des appels parallèles (aucun appel sortant au-delà)', async () => {
    const user = await newUser();
    const { max } = L.LINK_LIMITS.lookupsPerUser;
    const before = hits.length;
    const results = await Promise.all(Array.from({ length: 3 * max }, (_, i) => L.startIdConfirm(user, gameLookup, `PAR${i}`, { now: at(1000) })));
    expect(results.filter((r) => r.ok)).toHaveLength(max);
    expect(results.filter((r) => !r.ok && r.error === 'rate_limited')).toHaveLength(2 * max);
    expect(hits.length - before).toBe(max);
  });

  it('CHK-LNK-02 : un code ne lie qu’au jeu qui l’a émis et ne sert qu’une fois', async () => {
    const [u1, u2] = [await newUser(), await newUser()];
    const { code } = await issue(gameB, 'p-scope');
    expect(await L.redeemLinkCode(u1, gameA, code, { now: at(1000) })).toMatchObject({ ok: false, error: 'invalid_code' });
    const ok = await L.redeemLinkCode(u1, gameB, code, { now: at(2000) });
    expect(ok.ok && ok.link).toMatchObject({ gameId: gameB.id, playerId: 'p-scope', verified: 1 });
    expect(await L.redeemLinkCode(u2, gameB, code, { now: at(3000) })).toMatchObject({ ok: false, error: 'invalid_code' });
  });

  it('CHK-SSRF-02 : en production, https:// uniquement (enregistrement et appel)', async () => {
    expect(L.checkOutboundUrl('http://api.example.com/players/x', false, true).ok).toBe(false);
    expect(L.checkOutboundUrl('https://api.example.com/players/x', false, true).ok).toBe(true);
    const g = await insertGame('gam_https');
    expect(
      await L.updateLinkSettings(g.id, { methods: ['id_confirm'], playerLookupUrl: 'http://api.example.com/p/{player_id}' }, { allowPrivate: false, requireHttps: true }),
    ).toMatchObject({ ok: false, error: 'unsafe_url' });
    const before = hits.length;
    const r = await L.fetchPlayerLookup({ playerLookupUrl: `${base}/players/{player_id}`, webhookSecret: SECRET }, 'P1', { allowPrivate: true, requireHttps: true, now: T0 });
    expect(r).toMatchObject({ ok: false, error: 'unsafe_url' });
    expect(hits.length).toBe(before);
  });

  it('CHK-LNK-08 / T-LNK-06 : {player_id} seulement dans le chemin ou la query string', async () => {
    for (const bad of ['https://{player_id}.evil.example/x', 'https://{player_id}@api.example.com/x', 'https://api.example.com/x#{player_id}', '{player_id}']) {
      expect(L.checkLookupTemplate(bad), bad).not.toBeNull();
    }
    expect(L.checkLookupTemplate('https://api.example.com/players/{player_id}')).toBeNull();
    expect(L.checkLookupTemplate('https://api.example.com/players?id={player_id}&v=1')).toBeNull();
    const g = await insertGame('gam_tpl');
    expect(
      await L.updateLinkSettings(g.id, { methods: ['id_confirm'], playerLookupUrl: 'https://{player_id}.example.com/p' }, { allowPrivate: true }),
    ).toMatchObject({ ok: false, error: 'invalid_input' });
    // Modèle déjà en base (enregistré avant la règle) : refusé à l'appel, aucune requête.
    const before = hits.length;
    expect(
      await L.fetchPlayerLookup({ playerLookupUrl: 'http://{player_id}/players', webhookSecret: SECRET }, '127.0.0.1', { allowPrivate: true, now: T0 }),
    ).toMatchObject({ ok: false, error: 'unsafe_url' });
    expect(hits.length).toBe(before);
  });

  it('CHK-LNK-08 : un identifiant « .. » ne fait pas remonter le chemin appelé', async () => {
    const user = await newUser();
    const gameProfile = await insertGame('gam_profile', { linkMethods: ['id_confirm'], playerLookupUrl: `${base}/players/{player_id}/profile` });
    expect(await L.startIdConfirm(user, gameProfile, '..', { now: T0 })).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(await L.startIdConfirm(user, gameProfile, '.', { now: T0 })).toMatchObject({ ok: false, error: 'invalid_input' });
    const before = hits.length;
    expect(await L.fetchPlayerLookup(gameProfile, '..', { allowPrivate: true, now: T0 })).toMatchObject({ ok: false, error: 'unsafe_url' });
    expect(hits.length).toBe(before);
    // Les formes encodées restent encodées : le chemin ne change pas.
    await L.fetchPlayerLookup(gameProfile, '%2e%2e', { allowPrivate: true, now: T0 });
    expect(hits[before].url).toBe('/players/%252e%252e/profile');
  });

  it('CHK-LNK-10 / T-UPL-07 : display_name nettoyé (caractères invisibles, surcharges bidi) et rendu comme texte', async () => {
    expect(L.cleanDisplayName('‮etuor‬  Lina​')).toBe('etuor Lina');
    const user = await newUser();
    const g = await insertGame('gam_bidi', { linkMethods: ['id_confirm'], playerLookupUrl: `${base}/bidi/{player_id}` });
    const r = await L.startIdConfirm(user, g, 'B1', { now: T0 });
    expect(r.ok && r.player.display_name).toBe('etuor Lina<script>alert(1)</script>'); // texte brut, échappé par React à l'affichage
    // Un nom vide une fois nettoyé, ou un player_id avec caractères invisibles, est refusé.
    expect(L.playerLookupResponseSchema.safeParse({ player_id: 'x', display_name: '​‮' }).success).toBe(false);
    expect(L.playerLookupResponseSchema.safeParse({ player_id: 'a‮b', display_name: 'ok' }).success).toBe(false);
    // Même nettoyage pour le nom transmis par le jeu à la création d'un code.
    expect(L.linkCodeRequestSchema.parse({ player_id: 'p1', player_name: ' Li‮na ' }).player_name).toBe('Lina');
    expect(L.linkCodeRequestSchema.safeParse({ player_id: 'p​1' }).success).toBe(false);
  });

  it('désliaison : impossible sur le lien d’un autre utilisateur', async () => {
    const [owner, other] = [await newUser(), await newUser()];
    const { code } = await issue(gameA, 'p-unlink');
    const r = await L.redeemLinkCode(owner, gameA, code, { now: at(1000) });
    if (!r.ok) throw new Error(r.message);
    expect(await L.unlinkGameLink(other, r.link.id)).toBe(false);
    expect(await D.db.select().from(D.gameLinks).where(D.eq(D.gameLinks.id, r.link.id))).toHaveLength(1);
  });
});
