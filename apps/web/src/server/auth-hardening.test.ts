import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@devappstore/db/testing';
import { eq, user, type DB } from '@devappstore/db';

/*
 * Revue de sécurité 2026-11 (docs/security/revue-2026-11/auth-autorisation.md) : A-05 (limite par e-mail sur la route
 * HTTP Better Auth), A-06 (comptes de démo refusés en production), A-07 (inscription sans code USER_ALREADY_EXISTS),
 * A-09 (pas de blocage d'un compte depuis une autre IP), A-13 (nom et image bornés hors formulaires).
 */

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: () => undefined, get: () => undefined }),
  headers: async () => new Headers(),
}));

let database: DB;
let authMod: typeof import('./auth');
let RL: typeof import('./auth-rate-limit');
let flows: typeof import('./auth-flows');
let cfg: typeof import('./auth-config');

const ORIGIN = 'http://localhost:3000';

beforeAll(async () => {
  database = await createTestDb();
  (globalThis as unknown as { __devAppStoreDb?: DB }).__devAppStoreDb = database;
  authMod = await import('./auth');
  RL = await import('./auth-rate-limit');
  flows = await import('./auth-flows');
  cfg = await import('./auth-config');
  await flows.signUpWithPassword({ name: 'Cible', email: 'cible@durci.test', password: 'motdepasse1' }, { limiter: new RL.SlidingWindowLimiter() });
  await flows.signUpWithPassword({ name: 'Démo', email: 'demo@devappstore.test', password: 'motdepasse1' }, { limiter: new RL.SlidingWindowLimiter() });
}, 60_000);

afterEach(() => vi.unstubAllEnvs());

function post(auth: ReturnType<typeof import('./auth').createAuth>, path: string, body: unknown, ip: string, cookie?: string) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe('A-05 / A-09 : échecs de connexion sur la route HTTP /api/auth/sign-in/email', () => {
  it('bloque le couple e-mail + IP après 8 échecs, sans bloquer la titulaire depuis une autre IP', async () => {
    const limiter = new RL.SlidingWindowLimiter();
    const auth = authMod.createAuth(database, { limiter });
    const { max } = RL.AUTH_RATE_LIMITS.signInFailuresPerEmailIp;
    for (let i = 0; i < max; i++) {
      expect((await post(auth, '/sign-in/email', { email: 'cible@durci.test', password: `faux-${i}` }, '203.0.113.1')).status).toBe(401);
    }
    const blocked = await post(auth, '/sign-in/email', { email: 'Cible@Durci.test', password: 'motdepasse1' }, '203.0.113.1');
    expect(blocked.status).toBe(429);
    const owner = await post(auth, '/sign-in/email', { email: 'cible@durci.test', password: 'motdepasse1' }, '198.51.100.7');
    expect(owner.status).toBe(200);
  });

  it('plafond par e-mail toutes IP confondues (bourrage distribué), partagé avec le formulaire', async () => {
    const limiter = new RL.SlidingWindowLimiter();
    const auth = authMod.createAuth(database, { limiter });
    const { max } = RL.AUTH_RATE_LIMITS.signInFailuresPerEmail;
    for (let i = 0; i < max; i++) RL.recordSignInFailure(limiter, 'cible@durci.test', `192.0.2.${i}`);
    expect((await post(auth, '/sign-in/email', { email: 'cible@durci.test', password: 'motdepasse1' }, '198.51.100.8')).status).toBe(429);
    const form = await flows.signInWithPassword({ email: 'cible@durci.test', password: 'motdepasse1' }, { limiter, headers: new Headers({ 'x-forwarded-for': '198.51.100.8' }) });
    expect(form.error).toMatch(/Trop de tentatives/);
  });

  it('formulaire : 8 échecs depuis une IP ne bloquent pas une autre IP (A-09)', async () => {
    const limiter = new RL.SlidingWindowLimiter();
    const attacker = new Headers({ 'x-forwarded-for': '203.0.113.66' });
    for (let i = 0; i < RL.AUTH_RATE_LIMITS.signInFailuresPerEmailIp.max; i++) {
      await flows.signInWithPassword({ email: 'cible@durci.test', password: `faux-${i}` }, { limiter, headers: attacker });
    }
    expect((await flows.signInWithPassword({ email: 'cible@durci.test', password: 'motdepasse1' }, { limiter, headers: attacker })).error).toMatch(/Trop de tentatives/);
    const owner = await flows.signInWithPassword({ email: 'cible@durci.test', password: 'motdepasse1' }, { limiter, headers: new Headers({ 'x-forwarded-for': '198.51.100.9' }) });
    expect(owner.ok).toBe(true);
  });
});

describe('A-07 : l’inscription ne dit pas si le compte existe (même réponse que pour une adresse libre)', () => {
  it('formulaire : réponse identique, sans identifiant de compte', async () => {
    const taken = await flows.signUpWithPassword({ name: 'Sonde', email: 'cible@durci.test', password: 'motdepasse9' }, { limiter: new RL.SlidingWindowLimiter() });
    const fresh = await flows.signUpWithPassword({ name: 'Sonde', email: 'libre@durci.test', password: 'motdepasse9' }, { limiter: new RL.SlidingWindowLimiter() });
    expect(taken).toEqual({ ok: true, verificationSent: true });
    expect({ ...fresh, userId: undefined }).toEqual({ ok: true, verificationSent: true, userId: undefined });
  });

  it('route HTTP : 200 et même forme de réponse, adresse prise ou non, sans session', async () => {
    const auth = authMod.createAuth(database, { limiter: new RL.SlidingWindowLimiter() });
    const taken = await post(auth, '/sign-up/email', { name: 'Sonde', email: 'cible@durci.test', password: 'motdepasse9' }, '203.0.113.2');
    const fresh = await post(auth, '/sign-up/email', { name: 'Sonde', email: 'libre-http@durci.test', password: 'motdepasse9' }, '203.0.113.2');
    expect([taken.status, fresh.status]).toEqual([200, 200]);
    const shape = (b: { token: unknown; user: Record<string, unknown> }) => ({ token: b.token, keys: Object.keys(b.user).sort(), emailVerified: b.user.emailVerified });
    expect(shape(await taken.json())).toEqual(shape(await fresh.json()));
    expect(taken.headers.get('set-cookie') ?? '').not.toMatch(/session_token/);
    expect(fresh.headers.get('set-cookie') ?? '').not.toMatch(/session_token/);
  });
});

describe('A-13 : nom et image bornés sur les routes Better Auth', () => {
  it('inscription HTTP et /update-user : nom coupé à 80 caractères, image non https supprimée', async () => {
    const auth = authMod.createAuth(database, { limiter: new RL.SlidingWindowLimiter() });
    const res = await post(auth, '/sign-up/email', { name: 'N'.repeat(500), email: 'long@durci.test', password: 'motdepasse9', image: 'javascript:alert(1)' }, '203.0.113.3');
    expect(res.status).toBe(200);
    const [u] = await database.select({ id: user.id, name: user.name, image: user.image }).from(user).where(eq(user.email, 'long@durci.test'));
    expect(u!.name).toHaveLength(cfg.USER_NAME_MAX_LENGTH);
    expect(u!.image).toBeNull();

    // Inscription sans session (A-07) : on se connecte pour tester /update-user.
    const login = await post(auth, '/sign-in/email', { email: 'long@durci.test', password: 'motdepasse9' }, '203.0.113.3');
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect((await post(auth, '/update-user', { name: `  ${'x'.repeat(300)}  ` }, '203.0.113.3', cookie)).status).toBe(200);
    expect((await post(auth, '/update-user', { image: 'http://evil.test/a.png' }, '203.0.113.3', cookie)).status).toBe(200);
    const [after] = await database.select({ name: user.name, image: user.image }).from(user).where(eq(user.id, u!.id));
    expect(after).toEqual({ name: 'x'.repeat(80), image: null });
    expect((await post(auth, '/update-user', { name: '   ' }, '203.0.113.3', cookie)).status).toBe(400);
  });

  it('sanitizeUserProfile : garde les URL https, retire les caractères de contrôle', () => {
    expect(cfg.sanitizeUserProfile({ name: 'A\u0000b', image: 'https://cdn.test/a.png' })).toEqual({ name: 'A b', image: 'https://cdn.test/a.png' });
    expect(cfg.sanitizeUserProfile({ emailVerified: true })).toEqual({ emailVerified: true });
  });
});

describe('A-06 : comptes de démonstration refusés en production', () => {
  it('aucune session pour un e-mail @devappstore.test en production ; accepté en développement', async () => {
    const auth = authMod.createAuth(database, { limiter: new RL.SlidingWindowLimiter() });
    await expect(auth.api.signInEmail({ body: { email: 'demo@devappstore.test', password: 'motdepasse1' }, headers: new Headers() })).resolves.toBeTruthy();
    vi.stubEnv('NODE_ENV', 'production');
    await expect(auth.api.signInEmail({ body: { email: 'demo@devappstore.test', password: 'motdepasse1' }, headers: new Headers() })).rejects.toMatchObject({ statusCode: 403 });
    await expect(auth.api.signInEmail({ body: { email: 'cible@durci.test', password: 'motdepasse1' }, headers: new Headers() })).resolves.toBeTruthy();
    expect(cfg.isDemoAccountEmail('Dev@DevAppStore.test')).toBe(true);
    expect(cfg.isDemoAccountEmail('dev@devappstore.test.evil.com')).toBe(false);
  });
});
