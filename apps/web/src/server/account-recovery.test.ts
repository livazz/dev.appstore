import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@devappstore/db/testing';
import { account, eq, session, user, type DB } from '@devappstore/db';
import type { MailMessage } from '@devappstore/emails';

/*
 * Revue de sécurité A-04 / A-07 (docs/security/revue-2026-11/auth-autorisation.md) : vérification de l'adresse e-mail,
 * mot de passe oublié, inscription non énumérante, limitation de débit. Better Auth réel sur une base PGlite en mémoire,
 * transport d'e-mails capturé.
 */

const jar = new Map<string, string>();
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: (name: string, value: string, opts?: { maxAge?: number }) => {
      if (opts?.maxAge === 0 || value === '') jar.delete(name);
      else jar.set(name, value);
    },
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));

const ORIGIN = 'http://localhost:3000';

let database: DB;
let authMod: typeof import('./auth');
let flows: typeof import('./auth-flows');
let RL: typeof import('./auth-rate-limit');
let EV: typeof import('./email-verification');
let auth: ReturnType<typeof import('./auth').createAuth>;

const sent: MailMessage[] = [];
const pending: Promise<unknown>[] = [];
const mail = {
  mailer: { send: async (m: MailMessage) => (sent.push(m), { id: `m${sent.length}` }) },
  context: { appUrl: ORIGIN },
  defer: (_label: string, task: () => Promise<unknown>) => void pending.push(task()),
};
async function flush() {
  await Promise.all(pending.splice(0));
}
function mailsTo(email: string) {
  return sent.filter((m) => m.to === email);
}
function linkIn(m: MailMessage | undefined): string {
  const url = m?.text.match(/https?:\/\/\S+?(?=[\s)]|$)/g)?.find((u) => /token=/.test(u));
  if (!url) throw new Error(`aucun lien à jeton dans « ${m?.subject} »`);
  return url;
}

let limiter: import('./auth-rate-limit').SlidingWindowLimiter;
const deps = (ip = '203.0.113.10') => ({ auth, limiter, database, headers: new Headers({ 'x-forwarded-for': ip }) });

function post(path: string, body: unknown, ip: string) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    }),
  );
}

async function userByEmail(email: string) {
  const [u] = await database.select().from(user).where(eq(user.email, email));
  return u!;
}
async function sessionsOf(userId: string) {
  return database.$count(session, eq(session.userId, userId));
}

beforeAll(async () => {
  database = await createTestDb();
  (globalThis as unknown as { __devAppStoreDb?: DB }).__devAppStoreDb = database;
  authMod = await import('./auth');
  flows = await import('./auth-flows');
  RL = await import('./auth-rate-limit');
  EV = await import('./email-verification');
  auth = authMod.createAuth(database, { limiter: new RL.SlidingWindowLimiter(), mail });
}, 60_000);

beforeEach(() => {
  jar.clear();
  sent.length = 0;
  limiter = new RL.SlidingWindowLimiter();
});
afterEach(() => vi.useRealTimers());

describe('vérification de l’adresse e-mail', () => {
  it('l’inscription envoie un lien de vérification (24 h) ; le compte reste non vérifié et sans session', async () => {
    const r = await flows.signUpWithPassword({ name: 'Léa', email: 'lea@verif.test', password: 'motdepasse1' }, deps());
    await flush();
    expect(r).toMatchObject({ ok: true, verificationSent: true });
    expect(jar.size).toBe(0);
    expect((await userByEmail('lea@verif.test')).emailVerified).toBe(false);
    const [m] = mailsTo('lea@verif.test');
    expect(m?.subject).toBe('Confirmez votre adresse e-mail');
    expect(m?.text).toContain('24 heures');
    const link = new URL(linkIn(m));
    expect(link.pathname).toBe('/api/auth/verify-email');
    expect(link.searchParams.get('callbackURL')).toBe('/verify-email?done=1');
  });

  it('le lien vérifie l’adresse et ouvre une session ; rejoué, il ne fait plus rien', async () => {
    await flows.signUpWithPassword({ name: 'Max', email: 'max@verif.test', password: 'motdepasse1' }, deps());
    await flush();
    const link = linkIn(mailsTo('max@verif.test')[0]);
    const u = await userByEmail('max@verif.test');

    const first = await auth.handler(new Request(link));
    expect(first.status).toBe(302);
    expect(first.headers.get('location')).toBe('/verify-email?done=1');
    expect(first.headers.get('set-cookie') ?? '').toMatch(/session_token/);
    expect((await userByEmail('max@verif.test')).emailVerified).toBe(true);
    expect(await sessionsOf(u.id)).toBe(1);

    const replay = await auth.handler(new Request(link));
    expect(replay.status).toBe(302);
    expect(replay.headers.get('set-cookie') ?? '').not.toMatch(/session_token/);
    expect(await sessionsOf(u.id)).toBe(1);
  });

  it('un lien expiré (plus de 24 h) est refusé et l’adresse reste non vérifiée', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await flows.signUpWithPassword({ name: 'Tom', email: 'tom@verif.test', password: 'motdepasse1' }, deps());
    await flush();
    const link = linkIn(mailsTo('tom@verif.test')[0]);
    vi.setSystemTime(Date.now() + 24 * 60 * 60_000 + 60_000);
    const res = await auth.handler(new Request(link));
    expect(res.headers.get('location')).toBe('/verify-email?done=1&error=TOKEN_EXPIRED');
    expect((await userByEmail('tom@verif.test')).emailVerified).toBe(false);
  });

  it('un lien falsifié est refusé', async () => {
    const res = await auth.handler(new Request(`${ORIGIN}/api/auth/verify-email?token=faux.jeton.signe&callbackURL=%2Fverify-email%3Fdone%3D1`));
    expect(res.headers.get('location')).toMatch(/error=INVALID_TOKEN/);
  });

  it('« Renvoyer l’e-mail » : 1 par minute et 5 par heure ; rien pour une adresse déjà vérifiée', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const r = await flows.signUpWithPassword({ name: 'Zoé', email: 'zoe@verif.test', password: 'motdepasse1' }, deps());
    await flush();
    const me = { id: r.userId!, email: 'zoe@verif.test' };
    sent.length = 0;

    expect(await flows.resendVerificationEmail(me, deps())).toEqual({ ok: true });
    const again = await flows.resendVerificationEmail(me, deps());
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/Réessayez dans \d+ s/);
    for (let i = 0; i < 4; i++) {
      vi.setSystemTime(Date.now() + 61_000);
      expect((await flows.resendVerificationEmail(me, deps())).ok).toBe(true);
    }
    vi.setSystemTime(Date.now() + 61_000);
    expect((await flows.resendVerificationEmail(me, deps())).error).toMatch(/Réessayez dans \d+ min/);
    await flush();
    expect(mailsTo('zoe@verif.test')).toHaveLength(5);

    await database.update(user).set({ emailVerified: true }).where(eq(user.id, me.id));
    expect(await flows.resendVerificationEmail(me, deps())).toEqual({ ok: true, alreadyVerified: true });
  });

  it('route HTTP /send-verification-email limitée par adresse', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 2; i++) statuses.push((await post('/send-verification-email', { email: 'personne@verif.test' }, '203.0.113.50')).status);
    expect(statuses).toEqual([200, 429]);
  });

  it('un compte Google ou Apple est considéré comme vérifié', async () => {
    await database.insert(user).values({ id: 'usr_google', name: 'G', email: 'g@verif.test' });
    const ctx = await auth.$context;
    await ctx.internalAdapter.createAccount({ userId: 'usr_google', providerId: 'google', accountId: 'g-123' });
    expect(await EV.isEmailVerified('usr_google', database)).toBe(true);
    await database.insert(user).values({ id: 'usr_autre', name: 'A', email: 'a@verif.test' });
    await ctx.internalAdapter.createAccount({ userId: 'usr_autre', providerId: 'credential', accountId: 'usr_autre' });
    expect(await EV.isEmailVerified('usr_autre', database)).toBe(false);
  });

  it('assertEmailVerified lève une erreur en français pour un compte non vérifié ou inconnu', async () => {
    await expect(EV.assertEmailVerified('usr_autre', 'pour acheter', database)).rejects.toThrow(/Confirmez votre adresse e-mail pour acheter/);
    await expect(EV.assertEmailVerified('usr_inconnu', undefined, database)).rejects.toBeInstanceOf(EV.EmailNotVerifiedError);
    await expect(EV.assertEmailVerified('usr_google', undefined, database)).resolves.toBeUndefined();
  });
});

describe('A-07 : inscription non énumérante', () => {
  it('adresse déjà inscrite : même réponse, aucun compte créé, « vous avez déjà un compte » envoyé à la titulaire', async () => {
    await flows.signUpWithPassword({ name: 'Titulaire', email: 'prise@verif.test', password: 'motdepasse1' }, deps());
    await flush();
    sent.length = 0;
    const r = await flows.signUpWithPassword({ name: 'Intrus', email: 'Prise@Verif.test', password: 'autremotdepasse' }, deps('198.51.100.7'));
    await flush();
    expect(r).toEqual({ ok: true, verificationSent: true });
    expect(await database.$count(user, eq(user.email, 'prise@verif.test'))).toBe(1);
    const mails = mailsTo('prise@verif.test');
    expect(mails.map((m) => m.subject)).toEqual(['Vous avez déjà un compte Dev AppStore']);
    expect(mails[0]!.text).toContain(`${ORIGIN}/forgot-password`);
    expect((await userByEmail('prise@verif.test')).name).toBe('Titulaire');
  });
});

describe('mot de passe oublié', () => {
  async function newAccount(email: string, password = 'ancienmdp1') {
    const r = await flows.signUpWithPassword({ name: 'Compte', email, password }, deps());
    await flush();
    sent.length = 0;
    return r.userId!;
  }

  it('réponse neutre : identique pour une adresse inconnue (aucun e-mail) et pour un compte (lien 1 h)', async () => {
    await newAccount('connu@reset.test');
    const unknown = await flows.requestPasswordReset({ email: 'inconnu@reset.test' }, deps());
    const known = await flows.requestPasswordReset({ email: 'connu@reset.test' }, deps());
    await flush();
    expect(unknown).toEqual({ ok: true });
    expect(known).toEqual(unknown);
    expect(mailsTo('inconnu@reset.test')).toHaveLength(0);
    const [m] = mailsTo('connu@reset.test');
    expect(m?.subject).toBe('Réinitialisation de votre mot de passe Dev AppStore');
    expect(m?.text).toContain('1 heure');
    expect(new URL(linkIn(m)).pathname).toBe('/reset-password');
  });

  it('nouveau mot de passe : sessions révoquées, adresse vérifiée, notification envoyée ; jeton à usage unique', async () => {
    const id = await newAccount('reset@reset.test');
    await flows.signInWithPassword({ email: 'reset@reset.test', password: 'ancienmdp1' }, deps());
    await flows.signInWithPassword({ email: 'reset@reset.test', password: 'ancienmdp1' }, deps('198.51.100.20'));
    expect(await sessionsOf(id)).toBe(2);

    await flows.requestPasswordReset({ email: 'reset@reset.test' }, deps());
    await flush();
    const token = new URL(linkIn(mailsTo('reset@reset.test')[0])).searchParams.get('token')!;
    sent.length = 0;

    const r = await flows.resetPasswordWithToken({ token, password: 'nouveaumdp1', confirmPassword: 'nouveaumdp1' }, deps());
    await flush();
    expect(r).toEqual({ ok: true });
    expect(await sessionsOf(id)).toBe(0);
    expect((await userByEmail('reset@reset.test')).emailVerified).toBe(true);
    expect(mailsTo('reset@reset.test').map((m) => m.subject)).toEqual(['Votre mot de passe Dev AppStore a été modifié']);

    expect((await flows.signInWithPassword({ email: 'reset@reset.test', password: 'ancienmdp1' }, deps())).ok).toBe(false);
    expect((await flows.signInWithPassword({ email: 'reset@reset.test', password: 'nouveaumdp1' }, deps())).ok).toBe(true);

    const replay = await flows.resetPasswordWithToken({ token, password: 'piratemdp1', confirmPassword: 'piratemdp1' }, deps());
    expect(replay).toEqual({ ok: false, error: flows.RESET_LINK_INVALID_MESSAGE });
    expect((await flows.signInWithPassword({ email: 'reset@reset.test', password: 'piratemdp1' }, deps())).ok).toBe(false);
  });

  it('un jeton expiré (plus d’1 h) est refusé', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await newAccount('expire@reset.test');
    await flows.requestPasswordReset({ email: 'expire@reset.test' }, deps());
    await flush();
    const token = new URL(linkIn(mailsTo('expire@reset.test')[0])).searchParams.get('token')!;
    vi.setSystemTime(Date.now() + 61 * 60_000);
    const r = await flows.resetPasswordWithToken({ token, password: 'nouveaumdp1', confirmPassword: 'nouveaumdp1' }, deps());
    expect(r).toEqual({ ok: false, error: flows.RESET_LINK_INVALID_MESSAGE });
  });

  it('jeton inconnu refusé ; confirmation différente refusée avant tout appel', async () => {
    expect(await flows.resetPasswordWithToken({ token: 'inexistant', password: 'nouveaumdp1', confirmPassword: 'nouveaumdp1' }, deps())).toEqual({
      ok: false,
      error: flows.RESET_LINK_INVALID_MESSAGE,
    });
    const r = await flows.resetPasswordWithToken({ token: 'x', password: 'nouveaumdp1', confirmPassword: 'autre' }, deps());
    expect(r.fieldErrors?.confirmPassword).toMatch(/ne correspondent pas/);
    expect((await flows.resetPasswordWithToken({ token: 'x', password: 'court', confirmPassword: 'court' }, deps())).fieldErrors?.password).toMatch(/au moins 8/);
  });

  it('limitation : 3 demandes par adresse et 10 par IP, par heure (compte existant ou non)', async () => {
    const { max: perEmail } = RL.AUTH_RATE_LIMITS.passwordResetPerEmail;
    for (let i = 0; i < perEmail; i++) {
      expect(await flows.requestPasswordReset({ email: 'cible@limite.test' }, deps(`198.51.100.${30 + i}`))).toEqual({ ok: true });
    }
    expect((await flows.requestPasswordReset({ email: 'cible@limite.test' }, deps('198.51.100.99'))).error).toMatch(/Trop de tentatives/);

    const { max: perIp } = RL.AUTH_RATE_LIMITS.passwordResetPerIp;
    for (let i = 0; i < perIp; i++) await flows.requestPasswordReset({ email: `a${i}@limite.test` }, deps('192.0.2.1'));
    expect((await flows.requestPasswordReset({ email: 'neuf@limite.test' }, deps('192.0.2.1'))).error).toMatch(/Trop de tentatives/);
    expect((await flows.requestPasswordReset({ email: 'neuf@limite.test' }, deps('192.0.2.2'))).ok).toBe(true);
  });

  it('limitation des essais de jetons par IP', async () => {
    const { max } = RL.AUTH_RATE_LIMITS.passwordResetSubmitPerIp;
    for (let i = 0; i < max; i++) await flows.resetPasswordWithToken({ token: `t${i}`, password: 'nouveaumdp1', confirmPassword: 'nouveaumdp1' }, deps('192.0.2.9'));
    expect((await flows.resetPasswordWithToken({ token: 'encore', password: 'nouveaumdp1', confirmPassword: 'nouveaumdp1' }, deps('192.0.2.9'))).error).toMatch(
      /Trop de tentatives/,
    );
  });

  it('route HTTP /request-password-reset : réponse neutre, puis 429 au-delà de la limite par adresse', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await post('/request-password-reset', { email: 'http@limite.test' }, `203.0.113.${60 + i}`)).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('un compte sans mot de passe (Google) peut en définir un par ce flux', async () => {
    await database.insert(user).values({ id: 'usr_social', name: 'S', email: 'social@reset.test', emailVerified: true });
    await database.insert(account).values({ id: 'acc_social', userId: 'usr_social', providerId: 'google', accountId: 'g-9' });
    await flows.requestPasswordReset({ email: 'social@reset.test' }, deps());
    await flush();
    const token = new URL(linkIn(mailsTo('social@reset.test')[0])).searchParams.get('token')!;
    expect(await flows.resetPasswordWithToken({ token, password: 'motdepasse9', confirmPassword: 'motdepasse9' }, deps())).toEqual({ ok: true });
    expect((await flows.signInWithPassword({ email: 'social@reset.test', password: 'motdepasse9' }, deps())).ok).toBe(true);
  });
});
