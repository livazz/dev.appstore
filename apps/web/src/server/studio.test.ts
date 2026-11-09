import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ITEM_STYLE } from '@wolleen/core';
import { createTestDb } from '@wolleen/db/testing';
import type { DB } from '@wolleen/db';

/*
 * Tests des Server Actions : la base est remplacée par une base en mémoire, et la session par un
 * double de requireGameAccess qui applique la même règle (membre du studio du jeu, rôles optionnels)
 * pour l'utilisateur « connecté » courant.
 */

const h = vi.hoisted(() => ({ db: null as unknown as DB, currentUser: 'usr_dev' as string | null, accessCalls: [] as string[] }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@wolleen/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wolleen/db')>();
  return {
    ...actual,
    get db() {
      return h.db;
    },
  };
});

vi.mock('./session', async () => {
  const { and, eq, games, studioMembers } = await import('@wolleen/db');
  const requireUser = async () => {
    if (!h.currentUser) throw new Error('NEXT_REDIRECT');
    return { id: h.currentUser, email: `${h.currentUser}@t.test`, name: h.currentUser };
  };
  return {
    requireUser,
    requireGameAccess: async (gameId: string, roles?: string[]) => {
      h.accessCalls.push(gameId);
      const user = await requireUser();
      const [row] = await h.db
        .select({ studioId: games.studioId, role: studioMembers.role })
        .from(games)
        .innerJoin(studioMembers, and(eq(studioMembers.studioId, games.studioId), eq(studioMembers.userId, user.id)))
        .where(eq(games.id, gameId));
      if (!row || (roles && !roles.includes(row.role))) throw new Error('FORBIDDEN');
      return { user, studioId: row.studioId, role: row.role };
    },
  };
});

const actions = await import('./studio');
const { games, items, studioMembers, studios, user, eq } = await import('@wolleen/db');

const itemInput = {
  type: 'consumable' as const,
  title: 'Sac de gemmes',
  subtitle: '',
  keywords: ['Gemmes'],
  productId: 'gems_1200',
  priceCents: 799,
  oldPriceCents: null,
  quantity: 1200,
  models: [{ label: '' }],
  layout: 4 as const,
  style: DEFAULT_ITEM_STYLE,
};

function ok<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(`Action en échec : ${r.error}`);
  return r.data;
}

beforeAll(async () => {
  h.db = await createTestDb();
  await h.db.insert(user).values([
    { id: 'usr_dev', name: 'Dev', email: 'dev@t.test' },
    { id: 'usr_owner', name: 'Owner', email: 'owner@t.test' },
    { id: 'usr_other', name: 'Autre studio', email: 'other@t.test' },
  ]);
  await h.db.insert(studios).values([
    { id: 'std_a', name: 'Studio A', slug: 'studio-a' },
    { id: 'std_b', name: 'Studio B', slug: 'studio-b' },
  ]);
  await h.db.insert(studioMembers).values([
    { studioId: 'std_a', userId: 'usr_dev', role: 'developer' },
    { studioId: 'std_a', userId: 'usr_owner', role: 'owner' },
    { studioId: 'std_b', userId: 'usr_other', role: 'owner' },
  ]);
});

beforeEach(() => {
  h.currentUser = 'usr_dev';
  h.accessCalls = [];
});

describe('Server Actions du studio', () => {
  it('createGame renvoie la clé API une seule fois et crée le jeu dans le studio de l’utilisateur', async () => {
    const r = ok(await actions.createGame({ name: 'Pixel Farm', category: 'Simulation', currency: 'EUR' }));
    expect(r.apiKey).toMatch(/^wk_live_/);
    const [g] = await h.db.select().from(games).where(eq(games.id, r.id));
    expect(g?.studioId).toBe('std_a');
    expect(g?.apiKeyHash).not.toContain(r.apiKey);
  });

  it('chaque action sur un jeu vérifie l’accès et refuse un membre d’un autre studio', async () => {
    const { id } = ok(await actions.createGame({ name: 'Jeu A', category: 'RPG', currency: 'EUR' }));
    const it1 = ok(await actions.createItem(id, itemInput));

    h.currentUser = 'usr_other';
    h.accessCalls = [];
    const results = [
      await actions.updateGame(id, { name: 'Piraté' }),
      await actions.publishGame(id),
      await actions.unpublishGame(id),
      await actions.deleteGame(id),
      await actions.createItem(id, { ...itemInput, productId: 'x' }),
      await actions.updateItem(id, it1.id, { ...itemInput, title: 'Piraté' }),
      await actions.deleteItem(id, it1.id),
      await actions.moveItem(id, it1.id, 'down'),
      await actions.reorderItems(id, [it1.id]),
    ];
    for (const r of results) expect(r).toEqual({ ok: false, error: "Vous n'avez pas accès à ce jeu." });
    expect(h.accessCalls).toHaveLength(results.length);
    expect(h.accessCalls.every((g) => g === id)).toBe(true);

    const [g] = await h.db.select().from(games).where(eq(games.id, id));
    expect(g?.name).toBe('Jeu A');
    const [row] = await h.db.select().from(items).where(eq(items.id, it1.id));
    expect(row?.title).toBe('Sac de gemmes');
  });

  it('un utilisateur non connecté est redirigé (erreur propagée)', async () => {
    h.currentUser = null;
    await expect(actions.updateGame('gam_x', { name: 'x' })).rejects.toThrow('NEXT_REDIRECT');
    await expect(actions.createGame({ name: 'x', category: 'RPG', currency: 'EUR' })).rejects.toThrow('NEXT_REDIRECT');
  });

  it('seuls owner/admin peuvent supprimer un jeu', async () => {
    const { id } = ok(await actions.createGame({ name: 'À supprimer', category: 'RPG', currency: 'EUR' }));
    expect(await actions.deleteGame(id)).toEqual({ ok: false, error: "Vous n'avez pas accès à ce jeu." });
    h.currentUser = 'usr_owner';
    expect(await actions.deleteGame(id)).toEqual({ ok: true, data: undefined });
    expect(await h.db.select().from(games).where(eq(games.id, id))).toHaveLength(0);
  });

  it('renvoie les erreurs de validation et d’unicité sous forme lisible', async () => {
    const { id } = ok(await actions.createGame({ name: 'Validation', category: 'RPG', currency: 'EUR' }));
    ok(await actions.createItem(id, itemInput));
    expect(await actions.createItem(id, itemInput)).toEqual({ ok: false, error: 'Cet identifiant produit est déjà utilisé dans ce jeu.' });
    const bad = await actions.createItem(id, { ...itemInput, productId: 'p2', priceCents: 123 });
    expect(bad.ok).toBe(false);
    const grid = await actions.updateGame(id, { theme: { gradient: { enabled: false, c1: '#000000', c2: '#ffffff', style: 'linear' }, grid: { width: 10, height: 260, margin: 24 } } });
    expect(grid.ok).toBe(false);
  });

  it('publie puis dépublie une boutique (owner/admin)', async () => {
    const { id } = ok(await actions.createGame({ name: 'Publication', category: 'RPG', currency: 'EUR' }));
    ok(await actions.createItem(id, itemInput));
    // Matrice des rôles : un developer édite la boutique mais ne la publie pas.
    expect(await actions.publishGame(id)).toEqual({ ok: false, error: "Vous n'avez pas accès à ce jeu." });
    h.currentUser = 'usr_owner';
    await h.db.update(items).set({ active: false }).where(eq(items.gameId, id));
    expect((await actions.publishGame(id)).ok).toBe(false); // aucun article actif
    await h.db.update(items).set({ active: true }).where(eq(items.gameId, id));
    expect(ok(await actions.publishGame(id)).status).toBe('live');
    expect(ok(await actions.unpublishGame(id)).status).toBe('draft');
  });
});
