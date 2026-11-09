import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@devappstore/db/testing';
import { session as sessions, userSuspensions } from '@devappstore/db/schema';
import { eq } from 'drizzle-orm';
import type { DB } from '@devappstore/db';

/*
 * Back-office (user-suspension) : un compte désactivé ne peut plus se connecter par e-mail / mot de passe. Le refus vient
 * de `databaseHooks.session.create.before` (auth.ts) : aucune session n'est créée, aucun cookie n'est posé. La
 * réactivation rend la connexion possible.
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
  headers: async () => {
    const h = new Headers();
    if (jar.size) h.set('cookie', [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; '));
    return h;
  },
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url });
  },
}));

let tdb: DB;
let flows: typeof import('./auth-flows');
let session: typeof import('./session');
let userId = '';
const EMAIL = 'banni@test.fr';
const PASSWORD = 'motdepasse1';

beforeAll(async () => {
  tdb = await createTestDb();
  (globalThis as unknown as { __devAppStoreDb?: DB }).__devAppStoreDb = tdb;
  flows = await import('./auth-flows');
  session = await import('./session');
  const r = await flows.signUpWithPassword({ name: 'Banni', email: EMAIL, password: PASSWORD }, { playerWelcome: false });
  expect(r.ok).toBe(true);
  userId = r.userId!;
}, 60_000);

beforeEach(async () => {
  jar.clear();
  await tdb.delete(userSuspensions).where(eq(userSuspensions.userId, userId));
  await tdb.delete(sessions).where(eq(sessions.userId, userId));
});

const sessionCount = async () => (await tdb.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId))).length;

describe('connexion d’un compte désactivé (databaseHooks.session.create.before)', () => {
  it('refuse la connexion e-mail / mot de passe : pas de session, pas de cookie', async () => {
    await tdb.insert(userSuspensions).values({ userId, adminId: 'usr_admin', reason: 'Fraude au remboursement' });

    const r = await flows.signInWithPassword({ email: EMAIL, password: PASSWORD });
    expect(r.ok).toBe(false);
    // Message actuel : générique (authErrorMessage ne traduit pas le FORBIDDEN du hook) — jamais « incorrect ».
    expect(r).toMatchObject({ error: expect.any(String) });
    expect(r).not.toMatchObject({ error: 'E-mail ou mot de passe incorrect.' });
    expect(await sessionCount()).toBe(0);
    expect([...jar.keys()].some((k) => k.startsWith('devappstore.session_token'))).toBe(false);
    expect(await session.getCurrentUser()).toBeNull();
  });

  it('un mauvais mot de passe reste un échec ordinaire (le refus ne révèle rien sans le bon mot de passe)', async () => {
    await tdb.insert(userSuspensions).values({ userId, adminId: 'usr_admin', reason: 'Fraude' });
    const r = await flows.signInWithPassword({ email: EMAIL, password: 'mauvais-mdp' });
    expect(r).toMatchObject({ ok: false, error: 'E-mail ou mot de passe incorrect.' });
    expect(await sessionCount()).toBe(0);
  });

  it('après réactivation, la connexion fonctionne de nouveau', async () => {
    await tdb.insert(userSuspensions).values({ userId, adminId: 'usr_admin', reason: 'Vérification' });
    expect((await flows.signInWithPassword({ email: EMAIL, password: PASSWORD })).ok).toBe(false);

    await tdb.delete(userSuspensions).where(eq(userSuspensions.userId, userId));
    const r = await flows.signInWithPassword({ email: EMAIL, password: PASSWORD });
    expect(r).toMatchObject({ ok: true, userId });
    expect(await sessionCount()).toBe(1);
    expect((await session.getCurrentUser())?.id).toBe(userId);
  });
});
