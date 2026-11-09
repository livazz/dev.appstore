import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@wolleen/db/testing';
import { games, studioMembers, studios, userSuspensions } from '@wolleen/db/schema';
import { eq } from 'drizzle-orm';
import type { DB } from '@wolleen/db';

/*
 * Back-office : un compte désactivé (user_suspensions) n'a plus de session, même si son cookie Better Auth est encore
 * valide (readSession → null) ; getCurrentUser / requireUser / requireGameAccess le traitent comme déconnecté.
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
let devId = '';

beforeAll(async () => {
  tdb = await createTestDb();
  (globalThis as unknown as { __wolleenDb?: DB }).__wolleenDb = tdb;
  flows = await import('./auth-flows');
  session = await import('./session');
  await flows.signUpWithPassword({ name: 'Dev', email: 'dev-susp@test.fr', password: 'motdepasse1' });
  const dev = await tdb.query.user.findFirst({ where: (t, { eq }) => eq(t.email, 'dev-susp@test.fr') });
  devId = dev!.id;
  await tdb.insert(studios).values({ id: 'std_s', name: 'Studio S', slug: 'studio-s' });
  await tdb.insert(studioMembers).values({ studioId: 'std_s', userId: devId, role: 'owner' });
  await tdb.insert(games).values({
    id: 'gam_s', studioId: 'std_s', slug: 'jeu-s', name: 'Jeu S',
    theme: { gradient: { enabled: false, c1: '#000000', c2: '#ffffff', style: 'linear' }, grid: { width: 200, height: 260, margin: 24 } },
    webhookSecret: 'whsec_s', apiKeyHash: 'h_s', apiKeyPrefix: 'wk_secret_s',
  });
}, 60_000);

beforeEach(async () => {
  jar.clear();
  await tdb.delete(userSuspensions).where(eq(userSuspensions.userId, devId));
});

describe('compte désactivé par le back-office', () => {
  it('une session ouverte disparaît dès la désactivation (cookie toujours présent)', async () => {
    expect((await flows.signInWithPassword({ email: 'dev-susp@test.fr', password: 'motdepasse1' })).ok).toBe(true);
    expect((await session.getCurrentUser())?.id).toBe(devId);
    expect((await session.requireGameAccess('gam_s')).role).toBe('owner');

    await tdb.insert(userSuspensions).values({ userId: devId, adminId: 'usr_admin', reason: 'Fraude' });
    expect([...jar.keys()].some((k) => k.startsWith('wolleen.session_token'))).toBe(true);
    expect(await session.getCurrentUser()).toBeNull();
    await expect(session.requireUser('/account')).rejects.toMatchObject({ url: '/login?next=%2Faccount' });
    await expect(session.requireGameAccess('gam_s')).rejects.toMatchObject({ message: 'NEXT_REDIRECT' });
  });

  it('la réactivation rend la session (rien n’est supprimé côté cookie)', async () => {
    expect((await flows.signInWithPassword({ email: 'dev-susp@test.fr', password: 'motdepasse1' })).ok).toBe(true);
    await tdb.insert(userSuspensions).values({ userId: devId, adminId: 'usr_admin', reason: 'Vérification' });
    expect(await session.getCurrentUser()).toBeNull();
    await tdb.delete(userSuspensions).where(eq(userSuspensions.userId, devId));
    expect((await session.getCurrentUser())?.id).toBe(devId);
  });
});
