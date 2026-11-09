import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@wolleen/db/testing';
import type { DB } from '@wolleen/db';

/*
 * Revue de sécurité (vague 2) — authentification : secret obligatoire en production (CHK-CFG-02), attributs des
 * cookies (CHK-AUTH-03), limitation de débit des Server Actions (CHK-AUTH-04), énumération d'e-mails (CHK-AUTH-05),
 * longueurs maximales des champs.
 */

interface CookieOpts {
  maxAge?: number;
  httpOnly?: boolean;
  sameSite?: string;
  path?: string;
  secure?: boolean;
}
const jar = new Map<string, { value: string; opts?: CookieOpts }>();
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: (name: string, value: string, opts?: CookieOpts) => {
      if (opts?.maxAge === 0 || value === '') jar.delete(name);
      else jar.set(name, { value, opts });
    },
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
  }),
  headers: async () => new Headers(),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url });
  },
}));

let flows: typeof import('./auth-flows');
let RL: typeof import('./auth-rate-limit');
let cfg: typeof import('./auth-config');

beforeAll(async () => {
  (globalThis as unknown as { __wolleenDb?: DB }).__wolleenDb = await createTestDb();
  cfg = await import('./auth-config');
  RL = await import('./auth-rate-limit');
  flows = await import('./auth-flows');
  const limiter = new RL.SlidingWindowLimiter();
  await flows.signUpWithPassword({ name: 'Joueur', email: 'joueur@sec.test', password: 'motdepasse1' }, { limiter });
}, 60_000);

beforeEach(() => jar.clear());

const LONG_SECRET = 'a3f1c9e07b5d2486f0e1d3c5b7a9081726354a5b6c7d8e9f';

describe('CHK-CFG-02 / T-AUTH-02 : AUTH_SECRET obligatoire en production', () => {
  it('refuse de démarrer sans secret, avec une valeur d’exemple ou un secret trop court', () => {
    const prod = { NODE_ENV: 'production' };
    expect(() => cfg.resolveAuthSecret(prod)).toThrow(cfg.AuthConfigError);
    expect(() => cfg.resolveAuthSecret({ ...prod, AUTH_SECRET: 'change-me' })).toThrow(/exemple/);
    expect(() => cfg.resolveAuthSecret({ ...prod, AUTH_SECRET: cfg.DEV_AUTH_SECRET })).toThrow(/exemple/);
    expect(() => cfg.resolveAuthSecret({ ...prod, AUTH_SECRET: 'court' })).toThrow(/trop court/);
    expect(() => cfg.resolveAuthSecret({ ...prod, AUTH_SECRET: '   ' })).toThrow(/obligatoire/);
  });

  it('le message d’erreur ne divulgue jamais le secret', () => {
    try {
      cfg.resolveAuthSecret({ NODE_ENV: 'production', AUTH_SECRET: 'secret-tres-court-x' });
      expect.unreachable();
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('secret-tres-court-x');
    }
  });

  it('accepte un secret robuste (AUTH_SECRET ou BETTER_AUTH_SECRET)', () => {
    expect(cfg.resolveAuthSecret({ NODE_ENV: 'production', AUTH_SECRET: LONG_SECRET })).toBe(LONG_SECRET);
    expect(cfg.resolveAuthSecret({ NODE_ENV: 'production', BETTER_AUTH_SECRET: LONG_SECRET, AUTH_SECRET: 'x' })).toBe(LONG_SECRET);
  });

  it('ne bloque ni le développement ni la compilation (next build)', () => {
    expect(cfg.resolveAuthSecret({ NODE_ENV: 'development' })).toBe(cfg.DEV_AUTH_SECRET);
    expect(cfg.resolveAuthSecret({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' })).toBe(cfg.DEV_AUTH_SECRET);
  });

  it('le serveur échoue au démarrage (instrumentation → env.ts) sans secret en production', async () => {
    const { register } = await import('../instrumentation');
    const { EnvValidationError } = await import('../env');
    // Configuration de production par ailleurs complète : seul le secret de session manque.
    const prod: Record<string, string> = {
      NEXT_RUNTIME: 'nodejs',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://wolleen:pw@db.example/wolleen',
      APP_URL: 'https://wolleen.example',
      STRIPE_SECRET_KEY: 'sk_live_fake000',
      STRIPE_WEBHOOK_SECRET: 'whsec_fake',
      CRON_SECRET: 'c'.repeat(32),
      AUTH_SECRET: '',
      BETTER_AUTH_SECRET: '',
    };
    for (const [k, v] of Object.entries(prod)) vi.stubEnv(k, v);
    try {
      const err = await register().then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as InstanceType<typeof EnvValidationError>).issues.map((i) => i.variable)).toEqual(['AUTH_SECRET']);
      vi.stubEnv('AUTH_SECRET', 'change-me');
      await expect(register()).rejects.toThrow(/exemple/);
      vi.stubEnv('AUTH_SECRET', LONG_SECRET);
      await expect(register()).resolves.toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('CHK-AUTH-03 : cookies de session', () => {
  it('HttpOnly, SameSite=Lax, Path=/ (Secure seulement en production)', async () => {
    const res = await flows.signInWithPassword({ email: 'joueur@sec.test', password: 'motdepasse1' }, { limiter: new RL.SlidingWindowLimiter() });
    expect(res.ok).toBe(true);
    const session = [...jar.entries()].find(([k]) => k.includes('session_token'));
    expect(session).toBeDefined();
    expect(session![1].opts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });

  it('en production : Secure + préfixe __Secure-', () => {
    expect(cfg.sessionCookieOptions({ NODE_ENV: 'production' })).toEqual({
      useSecureCookies: true,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/', secure: true },
    });
    expect(cfg.sessionCookieOptions({ NODE_ENV: 'development' }).defaultCookieAttributes.secure).toBe(false);
  });
});

describe('CHK-AUTH-04 / CHK-AUTH-05 : limitation de débit et énumération', () => {
  it('bloque une adresse e-mail après trop d’échecs, même avec le bon mot de passe ensuite', async () => {
    const limiter = new RL.SlidingWindowLimiter();
    const { max } = RL.AUTH_RATE_LIMITS.signInFailuresPerEmail;
    for (let i = 0; i < max; i++) {
      const r = await flows.signInWithPassword({ email: 'joueur@sec.test', password: `mauvais-${i}` }, { limiter });
      expect(r).toEqual({ ok: false, error: 'E-mail ou mot de passe incorrect.' });
    }
    const blocked = await flows.signInWithPassword({ email: 'joueur@sec.test', password: 'motdepasse1' }, { limiter });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toMatch(/Trop de tentatives/);
    expect(jar.size).toBe(0);
    // Un autre compte n'est pas bloqué.
    expect((await flows.signInWithPassword({ email: 'autre@sec.test', password: 'xxxxxxxx' }, { limiter })).error).toBe('E-mail ou mot de passe incorrect.');
  });

  it('même message et même blocage que le compte existe ou non (pas d’énumération)', async () => {
    const limiter = new RL.SlidingWindowLimiter();
    const { max } = RL.AUTH_RATE_LIMITS.signInFailuresPerEmail;
    const outcomes: Record<string, string[]> = { existe: [], inconnu: [] };
    for (const [label, email] of [['existe', 'joueur@sec.test'], ['inconnu', 'personne@sec.test']] as const) {
      for (let i = 0; i <= max; i++) {
        outcomes[label].push((await flows.signInWithPassword({ email, password: 'mauvais-mdp' }, { limiter })).error ?? '');
      }
    }
    expect(outcomes.existe).toEqual(outcomes.inconnu);
  });

  it('bloque une IP après trop d’échecs, tous comptes confondus', async () => {
    const limiter = new RL.SlidingWindowLimiter();
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    const { max } = RL.AUTH_RATE_LIMITS.signInFailuresPerIp;
    // max - 1 échecs déjà enregistrés pour cette IP (évite max hachages de mot de passe), puis un vrai échec.
    for (let i = 0; i < max - 1; i++) limiter.record('signin:ip:203.0.113.7', RL.AUTH_RATE_LIMITS.signInFailuresPerIp);
    await flows.signInWithPassword({ email: 'cible@sec.test', password: 'mauvais-mdp' }, { limiter, headers });
    const r = await flows.signInWithPassword({ email: 'joueur@sec.test', password: 'motdepasse1' }, { limiter, headers });
    expect(r.error).toMatch(/Trop de tentatives/);
    // Une autre IP n'est pas concernée.
    const other = await flows.signInWithPassword({ email: 'joueur@sec.test', password: 'motdepasse1' }, { limiter, headers: new Headers({ 'x-forwarded-for': '198.51.100.9' }) });
    expect(other.ok).toBe(true);
  });

  it('limite les inscriptions par IP (création de comptes en masse, sondage d’e-mails)', async () => {
    const limiter = new RL.SlidingWindowLimiter();
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.50' });
    const { max } = RL.AUTH_RATE_LIMITS.signUpPerIp;
    for (let i = 0; i < max; i++) {
      await flows.signUpWithPassword({ name: 'Sonde', email: 'joueur@sec.test', password: 'motdepasse9' }, { limiter, headers });
    }
    const r = await flows.signUpWithPassword({ name: 'Nouveau', email: 'nouveau@sec.test', password: 'motdepasse9' }, { limiter, headers });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Trop de tentatives/);
    const studio = await flows.signUpStudio({ studioName: 'Studio Spam', name: 'N', email: 'spam@sec.test', password: 'motdepasse9' }, { limiter, headers });
    expect(studio.error).toMatch(/Trop de tentatives/);
  });

  it('le limiteur est atomique : des tentatives simultanées ne dépassent pas la limite', async () => {
    const limiter = new RL.SlidingWindowLimiter();
    const { max } = RL.AUTH_RATE_LIMITS.signUpPerIp;
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.99' });
    const results = await Promise.all(
      Array.from({ length: 3 * max }, (_, i) => flows.signUpWithPassword({ name: 'P', email: `par${i}@sec.test`, password: 'motdepasse9' }, { limiter, headers })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(max);
  });
});

describe('longueurs maximales des champs', () => {
  it('refuse les champs trop longs avant d’appeler Better Auth', async () => {
    const limiter = new RL.SlidingWindowLimiter();
    const longEmail = `${'a'.repeat(250)}@sec.test`;
    expect((await flows.signInWithPassword({ email: longEmail, password: 'x' }, { limiter })).fieldErrors?.email).toMatch(/trop longue/);
    expect((await flows.signInWithPassword({ email: 'joueur@sec.test', password: 'x'.repeat(129) }, { limiter })).fieldErrors?.password).toMatch(/128/);
    const r = await flows.signUpWithPassword({ name: 'n'.repeat(81), email: longEmail, password: 'p'.repeat(129) }, { limiter });
    expect(Object.keys(r.fieldErrors ?? {}).sort()).toEqual(['email', 'name', 'password']);
    expect((await flows.signUpStudio({ studioName: 's'.repeat(61) }, { limiter, currentUserId: 'usr_x' })).fieldErrors?.studioName).toBeDefined();
  });
});
