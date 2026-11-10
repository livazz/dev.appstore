import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_ITEM_STYLE } from '@devappstore/core';
import { createTestDb } from '@devappstore/db/testing';
import { studioMembers, studios, user, type DB } from '@devappstore/db';
import {
  createGameFor,
  createItemFor,
  gameInfoSchema,
  itemInputSchema,
  updateGameInfo,
  updateItemFor,
  type ItemInput,
} from './studio-logic';

/* Présentation de la boutique (storeDescription, screenshots) et champs d'article (description, promotion programmée). */

const item = (p: Partial<ItemInput> = {}): ItemInput => ({
  type: 'consumable',
  title: 'Sac de gemmes',
  productId: 'gems_1200',
  priceCents: 799,
  oldPriceCents: 1099,
  models: [{ label: '' }],
  layout: 4,
  style: DEFAULT_ITEM_STYLE,
  ...p,
});

const issue = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? null : r.error!.issues[0]!.message);

describe('gameInfoSchema : présentation et captures', () => {
  it('accepte 0 à 4000 caractères (texte rogné) et refuse au-delà', () => {
    expect(gameInfoSchema.parse({ storeDescription: '  Bonjour\n\nSuite  ' }).storeDescription).toBe('Bonjour\n\nSuite');
    expect(gameInfoSchema.parse({ storeDescription: '' }).storeDescription).toBe('');
    expect(gameInfoSchema.safeParse({ storeDescription: 'a'.repeat(4000) }).success).toBe(true);
    expect(issue(gameInfoSchema.safeParse({ storeDescription: 'a'.repeat(4001) }))).toMatch(/4000/);
  });

  it('accepte 0 à 8 captures de notre stockage ou de la bibliothèque, uniques', () => {
    const lib = '/art/games/crystal-clash/hero.webp';
    const up = (n: number) => `/api/uploads/banner/usr_dev/shot-${n}.webp`;
    expect(gameInfoSchema.parse({ screenshots: [] }).screenshots).toEqual([]);
    expect(gameInfoSchema.parse({ screenshots: [lib, up(1)] }).screenshots).toEqual([lib, up(1)]);
    expect(gameInfoSchema.safeParse({ screenshots: Array.from({ length: 8 }, (_, i) => up(i)) }).success).toBe(true);
    expect(issue(gameInfoSchema.safeParse({ screenshots: Array.from({ length: 9 }, (_, i) => up(i)) }))).toMatch(/8 captures/);
    expect(issue(gameInfoSchema.safeParse({ screenshots: [lib, lib] }))).toMatch(/déjà présente/);
    expect(issue(gameInfoSchema.safeParse({ screenshots: ['https://evil.example/x.webp'] }))).toMatch(/URL/);
    expect(issue(gameInfoSchema.safeParse({ screenshots: ['/art/../secret.webp'] }))).toMatch(/URL/);
  });
});

describe('itemInputSchema : description et promotion programmée', () => {
  it('description optionnelle (vide par défaut), 600 caractères max', () => {
    expect(itemInputSchema.parse(item()).description).toBe('');
    expect(itemInputSchema.parse(item({ description: '  Contenu du pack  ' })).description).toBe('Contenu du pack');
    expect(itemInputSchema.safeParse(item({ description: 'a'.repeat(600) })).success).toBe(true);
    expect(issue(itemInputSchema.safeParse(item({ description: 'a'.repeat(601) })))).toMatch(/600/);
  });

  it('dates optionnelles : null, vide ou ISO → Date ; date invalide refusée', () => {
    const none = itemInputSchema.parse(item());
    expect(none.promoStartsAt).toBeNull();
    expect(none.promoEndsAt).toBeNull();
    expect(itemInputSchema.parse(item({ promoStartsAt: '', promoEndsAt: null })).promoStartsAt).toBeNull();
    const only = itemInputSchema.parse(item({ promoStartsAt: '2026-12-01T09:00:00.000Z' }));
    expect(only.promoStartsAt).toEqual(new Date('2026-12-01T09:00:00.000Z'));
    expect(only.promoEndsAt).toBeNull();
    expect(itemInputSchema.parse(item({ promoEndsAt: '2026-12-24T23:00:00.000Z' })).promoEndsAt).toEqual(new Date('2026-12-24T23:00:00.000Z'));
    expect(issue(itemInputSchema.safeParse(item({ promoStartsAt: 'demain' })))).toMatch(/invalide/);
  });

  it('fin strictement postérieure au début', () => {
    const start = '2026-12-01T09:00:00.000Z';
    expect(itemInputSchema.safeParse(item({ promoStartsAt: start, promoEndsAt: '2026-12-02T09:00:00.000Z' })).success).toBe(true);
    expect(issue(itemInputSchema.safeParse(item({ promoStartsAt: start, promoEndsAt: start })))).toMatch(/postérieure/);
    expect(issue(itemInputSchema.safeParse(item({ promoStartsAt: start, promoEndsAt: '2026-11-30T09:00:00.000Z' })))).toMatch(/postérieure/);
  });

  it('une promotion programmée exige un ancien prix', () => {
    expect(issue(itemInputSchema.safeParse(item({ oldPriceCents: null, promoStartsAt: '2026-12-01T09:00:00.000Z' })))).toMatch(/ancien prix/);
    expect(itemInputSchema.safeParse(item({ oldPriceCents: null })).success).toBe(true);
  });
});

describe('persistance', () => {
  let t: DB;
  beforeAll(async () => {
    t = await createTestDb();
    await t.insert(user).values({ id: 'usr_dev', name: 'Dev', email: 'dev@t.test' });
    await t.insert(studios).values({ id: 'std_a', name: 'Studio A', slug: 'studio-a' });
    await t.insert(studioMembers).values({ studioId: 'std_a', userId: 'usr_dev', role: 'developer' });
  });

  it('enregistre présentation, captures, description et dates de promotion', async () => {
    const { game } = await createGameFor(t, 'usr_dev', { name: 'Jeu', category: 'RPG', currency: 'EUR' });
    expect(game.storeDescription).toBe('');
    expect(game.screenshots).toEqual([]);
    const shots = ['/art/games/crystal-clash/hero.webp', '/api/uploads/banner/usr_dev/a.webp'];
    const up = await updateGameInfo(t, game.id, { storeDescription: 'Un.\n\nDeux.', screenshots: shots });
    expect(up.storeDescription).toBe('Un.\n\nDeux.');
    expect(up.screenshots).toEqual(shots);
    expect((await updateGameInfo(t, game.id, { screenshots: [shots[1]!, shots[0]!] })).screenshots).toEqual([shots[1], shots[0]]);

    const it1 = await createItemFor(t, game.id, item({ description: 'Pack', promoStartsAt: '2026-12-01T09:00:00.000Z', promoEndsAt: '2026-12-31T09:00:00.000Z' }));
    expect(it1.description).toBe('Pack');
    expect(it1.promoStartsAt).toEqual(new Date('2026-12-01T09:00:00.000Z'));
    expect(it1.promoEndsAt).toEqual(new Date('2026-12-31T09:00:00.000Z'));
    const cleared = await updateItemFor(t, game.id, it1.id, item({ description: '', promoStartsAt: null, promoEndsAt: null }));
    expect(cleared.description).toBe('');
    expect(cleared.promoStartsAt).toBeNull();
    expect(cleared.promoEndsAt).toBeNull();
  });

  it("refuse une capture téléversée par quelqu'un d'extérieur au studio", async () => {
    const { game } = await createGameFor(t, 'usr_dev', { name: 'Jeu 2', category: 'RPG', currency: 'EUR' });
    await expect(updateGameInfo(t, game.id, { screenshots: ['/api/uploads/banner/usr_autre/a.webp'] })).rejects.toThrow('Image introuvable');
  });
});
