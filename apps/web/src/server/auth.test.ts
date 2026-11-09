import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@devappstore/db/testing';
import { games, studioMembers, studios, user } from '@devappstore/db/schema';
import type { DB } from '@devappstore/db';

/*
 * Tests de l'authentification : Better Auth branché sur une base PGlite en mémoire.
 * `next/headers` est simulé par un « navigateur » minimal : les cookies posés par Better Auth
 * (plugin nextCookies) sont renvoyés dans l'en-tête Cookie des requêtes suivantes.
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
  headers: async () => requestHeaders(),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url });
  },
}));

function requestHeaders() {
  const h = new Headers();
  if (jar.size) h.set('cookie', [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; '));
  return h;
}

let tdb: DB;
let flows: typeof import('./auth-flows');
let session: typeof import('./session');
let authMod: typeof import('./auth');

beforeAll(async () => {
  tdb = await createTestDb();
  // `@devappstore/db` réutilise l'instance globale : on y place la base de test avant tout import applicatif.
  (globalThis as unknown as { __devAppStoreDb?: DB }).__devAppStoreDb = tdb;
  authMod = await import('./auth');
  flows = await import('./auth-flows');
  session = await import('./session');

  // Données : un studio + un jeu, un développeur membre et un joueur non membre.
  await flows.signUpWithPassword({ name: 'Dev', email: 'dev@test.fr', password: 'motdepasse1' });
  await flows.signUpWithPassword({ name: 'Joueur', email: 'joueur@test.fr', password: 'motdepasse2' });
  const dev = await tdb.query.user.findFirst({ where: (t, { eq }) => eq(t.email, 'dev@test.fr') });
  await tdb.insert(studios).values({ id: 'std_t', name: 'Studio T', slug: 'studio-t' });
  await tdb.insert(studioMembers).values({ studioId: 'std_t', userId: dev!.id, role: 'owner' });
  await tdb.insert(games).values({
    id: 'gam_t', studioId: 'std_t', slug: 'jeu-t', name: 'Jeu T',
    theme: { gradient: { enabled: false, c1: '#000000', c2: '#ffffff', style: 'linear' }, grid: { width: 200, height: 260, margin: 24 } },
    webhookSecret: 'whsec_t', apiKeyHash: 'h', apiKeyPrefix: 'das_test',
  });
}, 60000);

beforeEach(() => jar.clear());

describe('connexion e-mail + mot de passe', () => {
  it('connecte avec les bons identifiants et ouvre une session', async () => {
    const res = await flows.signInWithPassword({ email: 'Joueur@Test.fr ', password: 'motdepasse2' });
    expect(res.ok).toBe(true);
    expect([...jar.keys()].some((k) => k.startsWith('devappstore.session_token'))).toBe(true);
    const me = await session.getCurrentUser();
    expect(me).toMatchObject({ email: 'joueur@test.fr', name: 'Joueur' });
    expect(me!.id).toMatch(/^usr_/);
  });

  it('refuse un mauvais mot de passe avec un message en français', async () => {
    const res = await flows.signInWithPassword({ email: 'joueur@test.fr', password: 'mauvais-mdp' });
    expect(res).toEqual({ ok: false, error: 'E-mail ou mot de passe incorrect.' });
    expect(jar.size).toBe(0);
    expect(await session.getCurrentUser()).toBeNull();
  });

  it('refuse un e-mail inconnu', async () => {
    const res = await flows.signInWithPassword({ email: 'inconnu@test.fr', password: 'motdepasse2' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('E-mail ou mot de passe incorrect.');
  });

  it('valide les champs avant d’appeler Better Auth', async () => {
    const res = await flows.signInWithPassword({ email: 'pas-un-email', password: '' });
    expect(res.ok).toBe(false);
    expect(res.fieldErrors).toEqual({ email: 'Adresse e-mail invalide.', password: 'Saisissez votre mot de passe.' });
  });

  it('requireUser redirige vers /login?next=… sans session', async () => {
    await expect(session.requireUser('/account')).rejects.toMatchObject({ url: '/login?next=%2Faccount' });
  });
});

describe('inscription', () => {
  it('refuse un e-mail déjà utilisé', async () => {
    const res = await flows.signUpWithPassword({ name: 'Autre', email: 'dev@test.fr', password: 'motdepasse9' });
    expect(res.ok).toBe(false);
    // Revue de sécurité A-07 : message neutre, aucune erreur rattachée au champ e-mail.
    expect(res.error).toMatch(/Impossible de créer un compte/);
    expect(res.fieldErrors).toBeUndefined();
  });

  it('refuse un mot de passe trop court', async () => {
    const res = await flows.signUpWithPassword({ name: 'Court', email: 'court@test.fr', password: '123' });
    expect(res.fieldErrors?.password).toMatch(/au moins 8 caractères/);
  });

  it('inscription studio : crée le compte, le studio (slug unique) et le rôle owner', async () => {
    const res = await flows.signUpStudio({ studioName: 'Studio T', name: 'Alice', email: 'alice@test.fr', password: 'motdepasse3' }, { database: tdb });
    expect(res.ok).toBe(true);
    expect(res.studioSlug).toBe('studio-t-2');
    const members = await session.getUserStudios(res.userId!, tdb);
    expect(members).toEqual([expect.objectContaining({ studioId: res.studioId, role: 'owner' })]);
    // Connecté automatiquement après l'inscription.
    expect((await session.getCurrentUser())?.email).toBe('alice@test.fr');
  });

  it('inscription studio d’un utilisateur déjà connecté : seul le nom du studio est requis', async () => {
    const bob = await flows.signUpWithPassword({ name: 'Bob', email: 'bob@test.fr', password: 'motdepasse4' });
    const res = await flows.signUpStudio({ studioName: 'Ça Marche Studio' }, { database: tdb, currentUserId: bob.userId });
    expect(res).toMatchObject({ ok: true, userId: bob.userId, studioSlug: 'ca-marche-studio' });
  });
});

describe('requireGameAccess', () => {
  it('autorise un membre du studio', async () => {
    await flows.signInWithPassword({ email: 'dev@test.fr', password: 'motdepasse1' });
    const access = await session.requireGameAccess('gam_t');
    expect(access).toMatchObject({ studioId: 'std_t', role: 'owner' });
  });

  it('refuse un utilisateur connecté non membre', async () => {
    await flows.signInWithPassword({ email: 'joueur@test.fr', password: 'motdepasse2' });
    await expect(session.requireGameAccess('gam_t')).rejects.toThrow('FORBIDDEN');
  });

  it('refuse un membre dont le rôle n’est pas autorisé', async () => {
    await flows.signInWithPassword({ email: 'dev@test.fr', password: 'motdepasse1' });
    await expect(session.requireGameAccess('gam_t', ['finance'])).rejects.toThrow('FORBIDDEN');
  });

  it('redirige vers /login un visiteur non connecté', async () => {
    await expect(session.requireGameAccess('gam_t')).rejects.toMatchObject({ url: '/login?next=%2Fstudio' });
  });
});

describe('configuration', () => {
  it('n’active Google / Apple que si leurs variables existent', () => {
    expect(authMod.socialProvidersFromEnv({} as NodeJS.ProcessEnv)).toEqual({});
    const p = authMod.socialProvidersFromEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', APPLE_CLIENT_ID: 'a' } as unknown as NodeJS.ProcessEnv);
    expect(Object.keys(p)).toEqual(['google']);
  });

  it('les utilisateurs sont créés avec un identifiant préfixé', async () => {
    const rows = await tdb.select({ id: user.id }).from(user);
    expect(rows.every((r) => r.id.startsWith('usr_'))).toBe(true);
  });
});
