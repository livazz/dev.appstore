/*
 * Données de test de la tâche « payments ». À utiliser dans un fichier de test qui remplace la base globale
 * par une base en mémoire :
 *
 *   vi.mock('@wolleen/db', async (importOriginal) => {
 *     const { createTestDb } = await import('@wolleen/db/testing');
 *     (globalThis as { __wolleenDb?: unknown }).__wolleenDb = await createTestDb();
 *     return importOriginal();
 *   });
 *
 * (`@wolleen/db` réutilise globalThis.__wolleenDb s'il existe : la base de dev .data/pglite n'est jamais ouverte.)
 */
import { DEFAULT_ITEM_STYLE, DEFAULT_THEME, newId } from '@wolleen/core';
import { and, db, eq, gameLinks, games, items, orders, studios, user } from '@wolleen/db';

export const FX = {
  buyer: { id: 'usr_buyer', name: 'Acheteur', email: 'buyer@wolleen.test' },
  stranger: { id: 'usr_stranger', name: 'Sans liaison', email: 'stranger@wolleen.test' },
  studio: 'std_pay',
  game: { id: 'gam_pay', slug: 'jeu-test' },
  draftGame: { id: 'gam_draft', slug: 'jeu-brouillon' },
  item: 'itm_pay',
  inactiveItem: 'itm_off',
  draftItem: 'itm_draft',
  cheapItem: 'itm_cheap',
  player: { id: 'P-42', name: 'Bob' },
} as const;

export async function seedPaymentsFixtures() {
  await db.insert(user).values([FX.buyer, FX.stranger]);
  await db.insert(studios).values({ id: FX.studio, name: 'Studio Paiement', slug: 'studio-paiement' });
  const game = {
    studioId: FX.studio,
    theme: DEFAULT_THEME,
    webhookSecret: 'whsec_test',
    apiKeyHash: 'hash',
    apiKeyPrefix: 'wk_test',
  };
  await db.insert(games).values([
    { ...game, id: FX.game.id, slug: FX.game.slug, name: 'Jeu Test', status: 'live' },
    { ...game, id: FX.draftGame.id, slug: FX.draftGame.slug, name: 'Jeu Brouillon', status: 'draft' },
  ]);
  const item = { style: DEFAULT_ITEM_STYLE, gameId: FX.game.id };
  await db.insert(items).values([
    { ...item, id: FX.item, productId: 'gems_100', title: 'Sac de gemmes', priceCents: 799, quantity: 100 },
    { ...item, id: FX.inactiveItem, productId: 'old_pack', title: 'Ancien pack', priceCents: 499, active: false },
    { ...item, id: FX.cheapItem, productId: 'tiny', title: 'Presque rien', priceCents: 49 },
    { ...item, id: FX.draftItem, gameId: FX.draftGame.id, productId: 'gems_100', title: 'Gemmes', priceCents: 799 },
  ]);
  await db.insert(gameLinks).values([
    { id: 'lnk_buyer', userId: FX.buyer.id, gameId: FX.game.id, playerId: FX.player.id, playerName: FX.player.name, method: 'code', verified: 1 },
    { id: 'lnk_buyer_draft', userId: FX.buyer.id, gameId: FX.draftGame.id, playerId: FX.player.id, method: 'code', verified: 1 },
  ]);
}

/** Insère directement une commande en attente pour l'acheteur de test. */
export async function insertPendingOrder(overrides: Partial<typeof orders.$inferInsert> = {}) {
  const [o] = await db
    .insert(orders)
    .values({
      id: newId('ord'),
      userId: FX.buyer.id,
      gameId: FX.game.id,
      itemId: FX.item,
      productId: 'gems_100',
      itemTitle: 'Sac de gemmes',
      playerId: FX.player.id,
      quantity: 100,
      amountCents: 799,
      platformFeeCents: 40,
      currency: 'EUR',
      status: 'pending',
      ...overrides,
    })
    .returning();
  return o!;
}

/** Passe à `failed` les commandes `pending` d'un utilisateur (évite d'atteindre la limite anti-spam entre deux tests). */
export async function clearPendingOrders(userId: string = FX.buyer.id) {
  await db
    .update(orders)
    .set({ status: 'failed' })
    .where(and(eq(orders.userId, userId), eq(orders.status, 'pending')));
}

export async function getOrder(id: string) {
  const [o] = await db.select().from(orders).where(eq(orders.id, id));
  return o ?? null;
}
