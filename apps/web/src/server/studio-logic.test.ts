import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_ITEM_STYLE, DEFAULT_THEME, hashApiKey } from '@wolleen/core';
import { createTestDb } from '@wolleen/db/testing';
import { eq, games, items, orders, studioMembers, studios, user, type DB } from '@wolleen/db';
import {
  StudioError,
  createGameFor,
  createItemFor,
  deleteGameById,
  deleteItemFor,
  listItems,
  moveItemFor,
  reorderItemsFor,
  setGameStatus,
  updateGameInfo,
  updateItemFor,
  type ItemInput,
} from './studio-logic';

let t: DB;

const item = (p: Partial<ItemInput> = {}): ItemInput => ({
  type: 'consumable',
  title: 'Sac de gemmes',
  subtitle: '',
  keywords: ['Gemmes'],
  productId: 'gems_1200',
  priceCents: 799,
  oldPriceCents: 1099,
  quantity: 1200,
  models: [{ label: '1 200 gemmes' }],
  layout: 4,
  style: DEFAULT_ITEM_STYLE,
  ...p,
});

async function newGame(name = 'Mon jeu') {
  const { game } = await createGameFor(t, 'usr_dev', { name, category: 'RPG', currency: 'EUR' });
  return game;
}

beforeAll(async () => {
  t = await createTestDb();
  await t.insert(user).values([
    { id: 'usr_dev', name: 'Dev', email: 'dev@t.test' },
    { id: 'usr_fin', name: 'Finance', email: 'fin@t.test' },
    { id: 'usr_none', name: 'Joueur', email: 'joueur@t.test' },
  ]);
  await t.insert(studios).values({ id: 'std_a', name: 'Studio A', slug: 'studio-a' });
  await t.insert(studioMembers).values([
    { studioId: 'std_a', userId: 'usr_dev', role: 'developer' },
    { studioId: 'std_a', userId: 'usr_fin', role: 'finance' },
  ]);
});

describe('createGameFor', () => {
  it('crée un brouillon avec slug unique, secret webhook et empreinte de clé API', async () => {
    const a = await createGameFor(t, 'usr_dev', { name: 'Crystal Clash', category: 'Stratégie', currency: 'USD' });
    const b = await createGameFor(t, 'usr_dev', { name: 'Crystal  Clash!', category: 'Stratégie', currency: 'EUR' });
    expect(a.game.slug).toBe('crystal-clash');
    expect(b.game.slug).toBe('crystal-clash-2');
    expect(a.game.status).toBe('draft');
    expect(a.game.studioId).toBe('std_a');
    expect(a.game.publisherName).toBe('Studio A');
    expect(a.game.currency).toBe('USD');
    expect(a.game.theme).toEqual(DEFAULT_THEME);
    expect(a.game.webhookSecret).toMatch(/^whsec_/);
    expect(a.apiKey).toMatch(/^wk_live_/);
    // La clé en clair n'est pas stockée.
    expect(a.game.apiKeyHash).toBe(hashApiKey(a.apiKey));
    expect(JSON.stringify(a.game)).not.toContain(a.apiKey);
    expect(a.apiKey.startsWith(a.game.apiKeyPrefix)).toBe(true);
    expect(a.apiKey).not.toBe(b.apiKey);
  });

  it("refuse un utilisateur sans studio ou au rôle finance", async () => {
    await expect(createGameFor(t, 'usr_none', { name: 'X', category: 'RPG', currency: 'EUR' })).rejects.toThrow(StudioError);
    await expect(createGameFor(t, 'usr_fin', { name: 'X', category: 'RPG', currency: 'EUR' })).rejects.toThrow(/studio/);
  });

  it('valide nom, catégorie et devise', async () => {
    await expect(createGameFor(t, 'usr_dev', { name: '  ', category: 'RPG', currency: 'EUR' })).rejects.toThrow('obligatoire');
    await expect(createGameFor(t, 'usr_dev', { name: 'A', category: 'Inconnue' as never, currency: 'EUR' })).rejects.toThrow('Catégorie');
    await expect(createGameFor(t, 'usr_dev', { name: 'A', category: 'RPG', currency: 'JPY' as never })).rejects.toThrow('Devise');
  });
});

describe('updateGameInfo', () => {
  it('met à jour les champs en ligne et le thème', async () => {
    const g = await newGame();
    const theme = { gradient: { enabled: true, c1: '#112233', c2: '#ffffff', style: 'radial' as const }, grid: { width: 220, height: 300, margin: 10 } };
    const up = await updateGameInfo(t, g.id, { name: ' Nouveau nom ', subtitle: 'Sous-titre', theme, bannerUrl: '/api/uploads/banner/x.webp' });
    expect(up.name).toBe('Nouveau nom');
    expect(up.slug).toBe(g.slug); // l'URL publique ne change pas
    expect(up.theme).toEqual(theme);
    expect(up.bannerUrl).toBe('/api/uploads/banner/x.webp');
    const cleared = await updateGameInfo(t, g.id, { bannerUrl: null });
    expect(cleared.bannerUrl).toBeNull();
  });

  it('rejette une grille hors limites, une couleur invalide ou une URL douteuse', async () => {
    const g = await newGame();
    await expect(updateGameInfo(t, g.id, { theme: { ...DEFAULT_THEME, grid: { width: 999, height: 260, margin: 24 } } })).rejects.toThrow(StudioError);
    await expect(updateGameInfo(t, g.id, { theme: { ...DEFAULT_THEME, gradient: { ...DEFAULT_THEME.gradient, c1: 'red' } } })).rejects.toThrow('Couleur');
    await expect(updateGameInfo(t, g.id, { iconUrl: 'javascript:alert(1)' })).rejects.toThrow('URL');
    await expect(updateGameInfo(t, g.id, { iconUrl: '//evil.example/x.png' })).rejects.toThrow('URL');
    await expect(updateGameInfo(t, g.id, { name: '' })).rejects.toThrow('obligatoire');
  });
});

describe('articles', () => {
  it('crée un article à la fin de la grille et normalise les champs', async () => {
    const g = await newGame();
    const a = await createItemFor(t, g.id, item({ keywords: ['Gemmes', 'gemmes', ' Monnaie '] }));
    const b = await createItemFor(t, g.id, item({ productId: 'gems_6500', title: 'Coffre', type: 'auto_renewable', period: 'year' }));
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
    expect(a.keywords).toEqual(['Gemmes', 'Monnaie']);
    expect(a.period).toBe('month');
    expect(b.period).toBe('year');
    expect((await listItems(t, g.id)).map((i) => i.id)).toEqual([a.id, b.id]);
  });

  it('impose un product_id unique par jeu (mais réutilisable dans un autre jeu)', async () => {
    const g1 = await newGame();
    const g2 = await newGame();
    const a = await createItemFor(t, g1.id, item({ productId: 'pack' }));
    await expect(createItemFor(t, g1.id, item({ productId: 'pack' }))).rejects.toThrow('déjà utilisé');
    await expect(createItemFor(t, g2.id, item({ productId: 'pack' }))).resolves.toBeTruthy();
    const b = await createItemFor(t, g1.id, item({ productId: 'other' }));
    await expect(updateItemFor(t, g1.id, b.id, item({ productId: 'pack' }))).rejects.toThrow('déjà utilisé');
    // Garder son propre product_id est permis.
    await expect(updateItemFor(t, g1.id, a.id, item({ productId: 'pack', title: 'Renommé' }))).resolves.toMatchObject({ title: 'Renommé' });
  });

  it('valide prix (palier), ancien prix, type, visuels, mise en page et style', async () => {
    const g = await newGame();
    await expect(createItemFor(t, g.id, item({ priceCents: 500 }))).rejects.toThrow('palier');
    await expect(createItemFor(t, g.id, item({ priceCents: 999, oldPriceCents: 499 }))).rejects.toThrow('ancien prix');
    await expect(createItemFor(t, g.id, item({ title: ' ' }))).rejects.toThrow('titre');
    await expect(createItemFor(t, g.id, item({ productId: 'avec espace' }))).rejects.toThrow('Identifiant');
    await expect(createItemFor(t, g.id, item({ models: [] }))).rejects.toThrow('visuel');
    await expect(createItemFor(t, g.id, item({ models: [{ label: '' }, { label: '' }, { label: '' }, { label: '' }] }))).rejects.toThrow('3 visuels');
    await expect(createItemFor(t, g.id, item({ layout: 7 as never }))).rejects.toThrow(StudioError);
    await expect(createItemFor(t, g.id, item({ type: 'gift' as never }))).rejects.toThrow(StudioError);
    await expect(createItemFor(t, g.id, item({ style: { ...DEFAULT_ITEM_STYLE, borderWidth: 40 } }))).rejects.toThrow(StudioError);
    await expect(createItemFor(t, g.id, item({ quantity: 0 }))).rejects.toThrow(StudioError);
    await expect(createItemFor(t, g.id, item({ style: { ...DEFAULT_ITEM_STYLE, titleBg: 'transparent' }, oldPriceCents: null }))).resolves.toBeTruthy();
  });

  it("ne permet pas de modifier l'article d'un autre jeu via son identifiant", async () => {
    const mine = await newGame();
    const other = await newGame();
    const foreign = await createItemFor(t, other.id, item());
    await expect(updateItemFor(t, mine.id, foreign.id, item({ title: 'Piraté' }))).rejects.toThrow('introuvable');
    await expect(deleteItemFor(t, mine.id, foreign.id)).rejects.toThrow('introuvable');
    await expect(moveItemFor(t, mine.id, foreign.id, 'up')).rejects.toThrow('introuvable');
    const [row] = await t.select().from(items).where(eq(items.id, foreign.id));
    expect(row?.title).toBe('Sac de gemmes');
  });

  it("supprime un article non vendu et archive un article vendu", async () => {
    const g = await newGame();
    const a = await createItemFor(t, g.id, item({ productId: 'a' }));
    const b = await createItemFor(t, g.id, item({ productId: 'b' }));
    await t.insert(orders).values({
      id: 'ord_1', userId: 'usr_none', gameId: g.id, itemId: b.id, productId: 'b', itemTitle: 'B', playerId: 'p1',
      amountCents: 799, platformFeeCents: 40, currency: 'EUR', status: 'paid',
    });
    expect(await deleteItemFor(t, g.id, a.id)).toEqual({ archived: false });
    expect(await deleteItemFor(t, g.id, b.id)).toEqual({ archived: true });
    expect(await listItems(t, g.id)).toHaveLength(0);
    const [archived] = await t.select().from(items).where(eq(items.id, b.id));
    expect(archived?.active).toBe(false);
    await expect(createItemFor(t, g.id, item({ productId: 'b' }))).rejects.toThrow('archivé');
    await expect(deleteGameById(t, g.id)).rejects.toThrow('ventes');
  });

  it('déplace et réordonne les articles', async () => {
    const g = await newGame();
    const [a, b, c] = [
      await createItemFor(t, g.id, item({ productId: 'a' })),
      await createItemFor(t, g.id, item({ productId: 'b' })),
      await createItemFor(t, g.id, item({ productId: 'c' })),
    ];
    expect(await moveItemFor(t, g.id, c!.id, 'up')).toEqual([a!.id, c!.id, b!.id]);
    expect(await moveItemFor(t, g.id, a!.id, 'up')).toEqual([a!.id, c!.id, b!.id]); // déjà en tête
    expect(await moveItemFor(t, g.id, a!.id, 'down')).toEqual([c!.id, a!.id, b!.id]);
    expect((await listItems(t, g.id)).map((i) => [i.id, i.position])).toEqual([[c!.id, 0], [a!.id, 1], [b!.id, 2]]);
    await reorderItemsFor(t, g.id, [b!.id, a!.id, c!.id]);
    expect((await listItems(t, g.id)).map((i) => i.id)).toEqual([b!.id, a!.id, c!.id]);
    await expect(reorderItemsFor(t, g.id, [b!.id, a!.id])).rejects.toThrow('ordre');
    await expect(reorderItemsFor(t, g.id, [b!.id, a!.id, a!.id])).rejects.toThrow('ordre');
  });
});

describe('statut et suppression du jeu', () => {
  it('publie seulement une boutique avec au moins un article', async () => {
    const g = await newGame();
    await expect(setGameStatus(t, g.id, 'live')).rejects.toThrow('au moins un article');
    await createItemFor(t, g.id, item());
    expect((await setGameStatus(t, g.id, 'live')).status).toBe('live');
    expect((await setGameStatus(t, g.id, 'draft')).status).toBe('draft');
  });

  it('refuse de publier un jeu suspendu', async () => {
    const g = await newGame();
    await createItemFor(t, g.id, item());
    await t.update(games).set({ status: 'suspended' }).where(eq(games.id, g.id));
    await expect(setGameStatus(t, g.id, 'live')).rejects.toThrow('suspendu');
  });

  it('supprime un jeu sans ventes (et ses articles)', async () => {
    const g = await newGame();
    const it1 = await createItemFor(t, g.id, item());
    await deleteGameById(t, g.id);
    expect(await t.select().from(games).where(eq(games.id, g.id))).toHaveLength(0);
    expect(await t.select().from(items).where(eq(items.id, it1.id))).toHaveLength(0);
  });
});
