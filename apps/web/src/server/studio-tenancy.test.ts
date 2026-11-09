import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ITEM_STYLE, DEFAULT_THEME, hashApiKey } from '@wolleen/core';
import { createTestDb } from '@wolleen/db/testing';
import type { DB } from '@wolleen/db';

/*
 * Revue de sécurité (vague 2) — isolation multi-tenant de l'espace studio (CHK-MT-01/02/03/05/06, CHK-UPL-07).
 * « Le studio A ne peut pas toucher le jeu du studio B », pour chaque Server Action et route studio du périmètre :
 * actions de l'éditeur (server/studio.ts), réglages de liaison (LinkSettings), export CSV des ventes.
 * La session est simulée par un double de requireGameAccess appliquant la même règle que l'original.
 */

const h = vi.hoisted(() => ({ db: null as unknown as DB, currentUser: null as string | null }));

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
    getCurrentUser: async () => (h.currentUser ? requireUser() : null),
    requireGameAccess: async (gameId: string, roles?: string[]) => {
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
const { saveLinkSettingsAction } = await import('@/components/studio/link-settings-actions');
const { GET: exportSales } = await import('@/app/studio/games/[id]/sales/export/route');
const { games, items, studioMembers, studios, user, eq } = await import('@wolleen/db');

const FORBIDDEN = { ok: false, error: "Vous n'avez pas accès à ce jeu." };

const itemInput = {
  type: 'consumable' as const,
  title: 'Sac de gemmes',
  subtitle: '',
  keywords: [],
  productId: 'gems',
  priceCents: 799,
  oldPriceCents: null,
  quantity: 1,
  models: [{ label: '' }],
  layout: 4 as const,
  style: DEFAULT_ITEM_STYLE,
};

async function insertGame(id: string, studioId: string) {
  await h.db.insert(games).values({
    id, studioId, slug: id, name: `Jeu ${id}`, status: 'live', theme: DEFAULT_THEME, linkMethods: ['code'],
    webhookSecret: `whsec_${id}`, apiKeyHash: hashApiKey(`wk_${id}`), apiKeyPrefix: 'wk_test',
  });
  await h.db.insert(items).values([
    { id: `itm_${id}_1`, gameId: id, productId: 'p1', title: 'Original 1', priceCents: 499, position: 0, style: DEFAULT_ITEM_STYLE },
    { id: `itm_${id}_2`, gameId: id, productId: 'p2', title: 'Original 2', priceCents: 999, position: 1, style: DEFAULT_ITEM_STYLE },
  ]);
}

async function snapshot(gameId: string) {
  const [g] = await h.db.select().from(games).where(eq(games.id, gameId));
  const its = await h.db.select().from(items).where(eq(items.gameId, gameId));
  return JSON.stringify({ g, its: its.sort((a, b) => a.id.localeCompare(b.id)) });
}

beforeAll(async () => {
  h.db = await createTestDb();
  await h.db.insert(user).values(
    ['usr_a_owner', 'usr_a_dev', 'usr_a_fin', 'usr_b_owner'].map((id) => ({ id, name: id, email: `${id}@t.test` })),
  );
  await h.db.insert(studios).values([
    { id: 'std_a', name: 'Studio A', slug: 'studio-a' },
    { id: 'std_b', name: 'Studio B', slug: 'studio-b' },
  ]);
  await h.db.insert(studioMembers).values([
    { studioId: 'std_a', userId: 'usr_a_owner', role: 'owner' },
    { studioId: 'std_a', userId: 'usr_a_dev', role: 'developer' },
    { studioId: 'std_a', userId: 'usr_a_fin', role: 'finance' },
    { studioId: 'std_b', userId: 'usr_b_owner', role: 'owner' },
  ]);
  await insertGame('gam_a', 'std_a');
  await insertGame('gam_b', 'std_b');
}, 60_000);

beforeEach(() => {
  h.currentUser = 'usr_a_owner';
});

describe('CHK-MT-03 : le studio A ne peut pas toucher le jeu du studio B', () => {
  it('toutes les actions de l’éditeur sont refusées et la base est inchangée', async () => {
    const before = await snapshot('gam_b');
    const results = [
      await actions.updateGame('gam_b', { name: 'Piraté' }),
      await actions.publishGame('gam_b'),
      await actions.unpublishGame('gam_b'),
      await actions.deleteGame('gam_b'),
      await actions.createItem('gam_b', { ...itemInput, productId: 'evil' }),
      await actions.updateItem('gam_b', 'itm_gam_b_1', { ...itemInput, title: 'Piraté' }),
      await actions.deleteItem('gam_b', 'itm_gam_b_1'),
      await actions.moveItem('gam_b', 'itm_gam_b_1', 'down'),
      await actions.reorderItems('gam_b', ['itm_gam_b_2', 'itm_gam_b_1']),
    ];
    for (const r of results) expect(r).toEqual(FORBIDDEN);
    expect(await snapshot('gam_b')).toBe(before);
  });

  it('CHK-MT-02 : un article du jeu B passé avec l’identifiant du jeu A (autorisé) est introuvable', async () => {
    const before = await snapshot('gam_b');
    const results = [
      await actions.updateItem('gam_a', 'itm_gam_b_1', { ...itemInput, title: 'Piraté' }),
      await actions.deleteItem('gam_a', 'itm_gam_b_1'),
      await actions.moveItem('gam_a', 'itm_gam_b_1', 'up'),
      await actions.reorderItems('gam_a', ['itm_gam_b_1', 'itm_gam_b_2']),
      await actions.reorderItems('gam_a', ['itm_gam_a_2', 'itm_gam_a_1', 'itm_gam_b_1']),
    ];
    for (const r of results) expect(r.ok).toBe(false);
    expect(await snapshot('gam_b')).toBe(before);
  });

  it('réglages de liaison (LinkSettings) : refusés sur le jeu de B', async () => {
    const before = await snapshot('gam_b');
    const fd = new FormData();
    fd.append('methods', 'id_confirm');
    fd.append('playerLookupUrl', 'http://127.0.0.1:4100/players/{player_id}');
    const r = await saveLinkSettingsAction('gam_b', { version: 0 }, fd);
    expect(r.ok).toBeUndefined();
    expect(r.error).toMatch(/droits/);
    expect(await snapshot('gam_b')).toBe(before);
  });

  it('export CSV des ventes : 403 sur le jeu de B, sans contenu', async () => {
    const res = await exportSales(new Request('http://localhost/studio/games/gam_b/sales/export?days=30'), { params: Promise.resolve({ id: 'gam_b' }) });
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('order_id');
    const mine = await exportSales(new Request('http://localhost/studio/games/gam_a/sales/export?days=30'), { params: Promise.resolve({ id: 'gam_a' }) });
    expect(mine.status).toBe(200);
    expect(mine.headers.get('content-type')).toMatch(/^text\/csv/);
  });

  it('visiteur non connecté : redirigé (aucune action exécutée)', async () => {
    h.currentUser = null;
    await expect(actions.updateGame('gam_a', { name: 'x' })).rejects.toThrow('NEXT_REDIRECT');
    await expect(saveLinkSettingsAction('gam_a', { version: 0 }, new FormData())).rejects.toThrow('NEXT_REDIRECT');
    await expect(exportSales(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'gam_a' }) })).rejects.toThrow('NEXT_REDIRECT');
  });
});

describe('CHK-MT-06 : rôles au sein d’un studio', () => {
  it('finance ne modifie ni la boutique ni la liaison, mais exporte les ventes', async () => {
    h.currentUser = 'usr_a_fin';
    const before = await snapshot('gam_a');
    expect(await actions.updateGame('gam_a', { name: 'Finance' })).toEqual(FORBIDDEN);
    expect(await actions.createItem('gam_a', { ...itemInput, productId: 'fin' })).toEqual(FORBIDDEN);
    expect(await actions.updateItem('gam_a', 'itm_gam_a_1', { ...itemInput, title: 'Finance' })).toEqual(FORBIDDEN);
    expect(await actions.reorderItems('gam_a', ['itm_gam_a_2', 'itm_gam_a_1'])).toEqual(FORBIDDEN);
    expect(await actions.publishGame('gam_a')).toEqual(FORBIDDEN);
    const fd = new FormData();
    fd.append('methods', 'code');
    expect((await saveLinkSettingsAction('gam_a', { version: 0 }, fd)).error).toMatch(/droits/);
    expect(await snapshot('gam_a')).toBe(before);
    const res = await exportSales(new Request('http://localhost/x?days=7'), { params: Promise.resolve({ id: 'gam_a' }) });
    expect(res.status).toBe(200);
  });

  it('developer : édite la boutique, mais ne publie pas, ne supprime pas et ne voit pas les ventes', async () => {
    h.currentUser = 'usr_a_dev';
    expect((await actions.updateGame('gam_a', { subtitle: 'Par le dev' })).ok).toBe(true);
    expect(await actions.unpublishGame('gam_a')).toEqual(FORBIDDEN);
    expect(await actions.deleteGame('gam_a')).toEqual(FORBIDDEN);
    const res = await exportSales(new Request('http://localhost/x?days=7'), { params: Promise.resolve({ id: 'gam_a' }) });
    expect(res.status).toBe(403);
  });
});

describe('CHK-MT-05 : mass assignment', () => {
  it('les champs sensibles passés en plus sont ignorés', async () => {
    const [before] = await h.db.select().from(games).where(eq(games.id, 'gam_a'));
    const r = await actions.updateGame('gam_a', {
      name: 'Nouveau nom',
      studioId: 'std_b',
      status: 'suspended',
      webhookSecret: 'whsec_pirate',
      apiKeyHash: 'pirate',
      webhookUrl: 'https://evil.tld',
      slug: 'pirate',
    } as never);
    expect(r.ok).toBe(true);
    const [after] = await h.db.select().from(games).where(eq(games.id, 'gam_a'));
    expect(after.name).toBe('Nouveau nom');
    for (const k of ['studioId', 'status', 'webhookSecret', 'apiKeyHash', 'webhookUrl', 'slug'] as const) expect(after[k]).toEqual(before[k]);
    const it = await actions.createItem('gam_a', { ...itemInput, productId: 'mass', gameId: 'gam_b', active: false, id: 'itm_force' } as never);
    expect(it.ok && it.data.id).not.toBe('itm_force');
    expect(await h.db.select().from(items).where(eq(items.gameId, 'gam_b'))).toHaveLength(2);
  });
});

describe('CHK-UPL-07 / T-MT-02 : images rattachées au studio', () => {
  it('refuse une image téléversée par un membre d’un autre studio', async () => {
    expect(await actions.updateGame('gam_a', { iconUrl: '/api/uploads/icon/usr_b_owner/0b5e3c1a-1111-4222-8333-444455556666.webp' })).toEqual({
      ok: false,
      error: expect.stringMatching(/Image introuvable/),
    });
    const r = await actions.createItem('gam_a', {
      ...itemInput,
      productId: 'img_b',
      models: [{ imageUrl: '/api/uploads/item/usr_b_owner/0b5e3c1a-1111-4222-8333-444455556666.webp', label: '' }],
    });
    expect(r.ok).toBe(false);
  });

  it('accepte les uploads des membres du studio et les data:image de démo', async () => {
    h.currentUser = 'usr_a_dev';
    const own = '/api/uploads/icon/usr_a_owner/0b5e3c1a-1111-4222-8333-444455556666.webp';
    expect((await actions.updateGame('gam_a', { iconUrl: own, bannerUrl: 'data:image/svg+xml;utf8,%3Csvg%3E%3C/svg%3E' })).ok).toBe(true);
  });

  it('refuse les URL externes et les autres chemins du site', async () => {
    for (const url of [
      'https://pistage.tld/x.png',
      'http://pistage.tld/x.png',
      '//pistage.tld/x.png',
      'javascript:alert(1)',
      '/api/auth/sign-out',
      '/studio/games/gam_b/sales/export',
      '/api/uploads/../auth/x.webp',
      'data:text/html;base64,PHNjcmlwdD4=',
    ]) {
      const r = await actions.updateGame('gam_a', { bannerUrl: url });
      expect(r.ok, url).toBe(false);
    }
  });
});
