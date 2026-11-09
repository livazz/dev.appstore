/*
 * Données de démo du programme Points Wolleen (idempotent) : `npx tsx packages/db/src/seed-loyalty.ts`
 * après `npm run db:seed`. Règles : docs/product/loyalty.md (1 point / 10 c de commission, validité 365 jours).
 */
import { and, db, eq, games, inArray, items, loyaltyEntries, loyaltyRewards, orders } from './index';

const FEE_CENTS_PER_POINT = 10;
const TTL_DAYS = 365;
const DAY_MS = 86_400_000;

/** Récompenses de démo. Réductions : coût ≥ valeur / 2 points (plafond 20 % de la commission, cf. loyalty.md §4). */
export const DEMO_REWARDS: (typeof loyaltyRewards.$inferInsert)[] = [
  { id: 'lrw_demo_discount_1', kind: 'discount', title: '1 € de réduction', description: 'Sur votre prochain achat, dans le jeu de votre choix.', pointsCost: 50, valueCents: 100, position: 1 },
  { id: 'lrw_demo_discount_3', kind: 'discount', title: '3 € de réduction', description: 'Sur votre prochain achat, dans le jeu de votre choix.', pointsCost: 150, valueCents: 300, position: 2 },
  {
    id: 'lrw_demo_crystal_gold',
    kind: 'bonus_item',
    title: "Pile d'or offerte",
    description: '10 000 pièces d’or offertes par Nova Games dans Crystal Clash.',
    pointsCost: 30,
    gameId: 'gam_crystal',
    itemId: 'itm_crystal_gold_10000',
    perUserLimit: 1,
    stock: 1000,
    position: 3,
  },
  {
    id: 'lrw_demo_farm_seeds',
    kind: 'bonus_item',
    title: 'Sachet de graines offert',
    description: '50 graines rares offertes par Nova Games dans Pixel Farm.',
    pointsCost: 20,
    gameId: 'gam_farm',
    itemId: 'itm_farm_seeds_50',
    perUserLimit: 3,
    position: 4,
  },
];

export async function seedLoyalty(userId = 'usr_demo_player') {
  // Récompenses (seulement celles dont le jeu et l'article existent).
  const itemIds = DEMO_REWARDS.flatMap((r) => (r.itemId ? [r.itemId] : []));
  const existingItems = new Set(
    (await db.select({ id: items.id }).from(items).innerJoin(games, eq(games.id, items.gameId)).where(inArray(items.id, itemIds))).map((i) => i.id),
  );
  const rewards = DEMO_REWARDS.filter((r) => !r.itemId || existingItems.has(r.itemId));
  if (rewards.length) await db.insert(loyaltyRewards).values(rewards).onConflictDoNothing();

  // Points des commandes payées du joueur de démo (encore valides), par ordre chronologique.
  const paid = await db
    .select({ id: orders.id, fee: orders.platformFeeCents, paidAt: orders.paidAt, createdAt: orders.createdAt })
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.status, 'paid')));
  const now = Date.now();
  const rows = paid
    .map((o) => ({ ...o, at: o.paidAt ?? o.createdAt }))
    .filter((o) => o.fee >= FEE_CENTS_PER_POINT && now - o.at.getTime() < TTL_DAYS * DAY_MS)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((o) => ({
      id: `lpt_demo_${o.id.slice(4)}`,
      userId,
      delta: Math.floor(o.fee / FEE_CENTS_PER_POINT),
      reason: 'order_award' as const,
      orderId: o.id,
      expiresAt: new Date(o.at.getTime() + TTL_DAYS * DAY_MS),
      createdAt: o.at,
    }));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const r = await db.insert(loyaltyEntries).values(rows.slice(i, i + 200)).onConflictDoNothing().returning({ id: loyaltyEntries.id });
    inserted += r.length;
  }
  return { rewards: rewards.length, awards: inserted, points: rows.reduce((s, r) => s + r.delta, 0) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedLoyalty()
    .then((r) => {
      console.log(`Seed Points Wolleen : ${r.rewards} récompenses, ${r.awards} attributions ajoutées (${r.points} points au total pour le joueur de démo)`);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
