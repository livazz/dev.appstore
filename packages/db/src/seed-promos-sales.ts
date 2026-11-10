/*
 * Seed « classements et promos » : ventes payées sur 30 jours pour tous les jeux live (classements crédibles) et fenêtres
 * de promotion (≈ 20 articles en promo aujourd'hui, ≈ 10 à venir). Appelé par seed.ts après seedCatalog().
 *
 * - Déterministe : générateur pseudo-aléatoire initialisé par l'identifiant de chaque jeu / article.
 * - Idempotent : identifiants fixes (`ord_rank_…`, `dlv_rank_…`) ; relancer le seed ne crée aucun doublon mais recale
 *   les dates sur la date d'exécution (upsert des dates), de même que les fenêtres de promo.
 * - Les jeux de démo Crystal Clash et Pixel Farm sont exclus : ils ont déjà leurs ventes (seedDemoSales) et les e2e
 *   s'appuient sur leurs prix.
 */
import { DEFAULT_PLATFORM_FEE_BPS, feeCents } from '@devappstore/core';
import { notInArray } from 'drizzle-orm';
import { and, asc, db, deliveries, eq, games, items, orders, sql } from './index';

const BUYER = 'usr_demo_player';
const PLAYER_ID = '#2PP8QL9';
const DAYS = 30;
const DAY = 86_400_000;
const EXCLUDED = ['gam_crystal', 'gam_farm'];

/** FNV-1a 32 bits. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** mulberry32 */
function rng(seed: number) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Prix barré « commercial » (…,99) supérieur au prix, pour une remise d'environ `pct` %. */
function strikePrice(priceCents: number, pct: number): number {
  const target = Math.round(priceCents / (1 - pct / 100) / 100) * 100 - 1;
  return Math.max(target, priceCents + 100);
}

export async function seedPromosSales(now = Date.now()) {
  const liveGames = await db
    .select({ id: games.id, currency: games.currency })
    .from(games)
    .where(and(eq(games.status, 'live'), notInArray(games.id, EXCLUDED)))
    .orderBy(asc(games.id));
  const catalog = await db
    .select({ id: items.id, gameId: items.gameId, productId: items.productId, title: items.title, type: items.type, priceCents: items.priceCents, oldPriceCents: items.oldPriceCents })
    .from(items)
    .innerJoin(games, eq(games.id, items.gameId))
    .where(and(eq(items.active, true), eq(games.status, 'live'), notInArray(items.gameId, EXCLUDED)))
    .orderBy(asc(items.id));
  const byGame = new Map<string, typeof catalog>();
  for (const it of catalog) byGame.set(it.gameId, [...(byGame.get(it.gameId) ?? []), it]);

  // ---------- Ventes ----------
  const orderRows: (typeof orders.$inferInsert)[] = [];
  const deliveryRows: (typeof deliveries.$inferInsert)[] = [];
  for (const g of liveGames) {
    const list = byGame.get(g.id);
    if (!list?.length) continue;
    const rand = rng(hash(`ventes:${g.id}`));
    // Popularité très inégale (quelques succès, une longue traîne) : 2 à ~160 ventes sur 30 jours.
    const total = Math.round(2 + 158 * rand() ** 3);
    // Tendance : > 1 = jeu en progression (ventes concentrées sur les jours récents), < 1 = en perte de vitesse.
    const trend = 0.5 + rand() * 1.5;
    // Articles bon marché plus vendus.
    const weights = list.map((it) => 1 / Math.sqrt(Math.max(99, it.priceCents)));
    const wSum = weights.reduce((s, w) => s + w, 0);
    for (let k = 0; k < total; k++) {
      let r = rand() * wSum;
      let idx = 0;
      while (idx < list.length - 1 && (r -= weights[idx]!) >= 0) idx++;
      const item = list[idx]!;
      // u ∈ [0,1[ : 0 = il y a 30 jours, 1 = maintenant ; u^(1/trend) penche vers le récent si trend > 1.
      const u = rand() ** (1 / trend);
      const paidAt = new Date(now - Math.floor((1 - u) * DAYS * DAY) - 60_000);
      const quantity = item.type === 'consumable' && rand() < 0.1 ? 2 : 1;
      const amountCents = item.priceCents * quantity;
      const id = `ord_rank_${g.id.slice(4)}_${k}`;
      const deliveryId = `dlv_rank_${g.id.slice(4)}_${k}`;
      orderRows.push({
        id, userId: BUYER, gameId: g.id, itemId: item.id, productId: item.productId, itemTitle: item.title, playerId: PLAYER_ID,
        quantity, amountCents, platformFeeCents: feeCents(amountCents, DEFAULT_PLATFORM_FEE_BPS), currency: g.currency,
        status: 'paid', createdAt: new Date(paidAt.getTime() - 45_000), paidAt,
      });
      deliveryRows.push({
        id: deliveryId, orderId: id, gameId: g.id, playerId: PLAYER_ID, status: 'acknowledged', attempts: 1,
        deliveredAt: new Date(paidAt.getTime() + 2_000), acknowledgedAt: new Date(paidAt.getTime() + 5_000), createdAt: paidAt,
        payload: {
          event: 'purchase.completed', delivery_id: deliveryId, order_id: id, game_id: g.id, player_id: PLAYER_ID, product_id: item.productId,
          item_type: item.type, quantity, amount_cents: amountCents, currency: g.currency, created_at: paidAt.toISOString(),
        },
      });
    }
  }
  for (let i = 0; i < orderRows.length; i += 200) {
    await db
      .insert(orders)
      .values(orderRows.slice(i, i + 200))
      .onConflictDoUpdate({ target: orders.id, set: { paidAt: sql`excluded.paid_at`, createdAt: sql`excluded.created_at` } });
  }
  for (let i = 0; i < deliveryRows.length; i += 200) {
    await db
      .insert(deliveries)
      .values(deliveryRows.slice(i, i + 200))
      .onConflictDoUpdate({
        target: deliveries.id,
        set: { createdAt: sql`excluded.created_at`, deliveredAt: sql`excluded.delivered_at`, acknowledgedAt: sql`excluded.acknowledged_at`, payload: sql`excluded.payload` },
      });
  }

  // ---------- Promotions programmées ----------
  // Ordre déterministe : tri par empreinte de l'identifiant ; au plus un article en promo par jeu et par bandeau.
  const candidates = [...catalog].filter((it) => it.priceCents >= 99).sort((a, b) => hash(`promo:${a.id}`) - hash(`promo:${b.id}`) || (a.id < b.id ? -1 : 1));
  const used = new Set<string>();
  const pickN = (n: number) => {
    const out: typeof catalog = [];
    for (const it of candidates) {
      if (out.length >= n) break;
      if (used.has(it.gameId)) continue;
      used.add(it.gameId);
      out.push(it);
    }
    return out;
  };
  const live = pickN(20);
  const upcoming = pickN(10);
  const HOUR = 3_600_000;
  const update = async (it: (typeof catalog)[number], startsAt: Date, endsAt: Date, rand: () => number) => {
    const oldPriceCents = it.oldPriceCents != null && it.oldPriceCents > it.priceCents ? it.oldPriceCents : strikePrice(it.priceCents, 20 + Math.floor(rand() * 5) * 10);
    await db.update(items).set({ oldPriceCents, promoStartsAt: startsAt, promoEndsAt: endsAt }).where(eq(items.id, it.id));
  };
  for (const it of live) {
    const rand = rng(hash(`fenetre:${it.id}`));
    const startsAt = new Date(now - Math.floor((2 + rand() * 46) * HOUR)); // commencée il y a 2 h à 2 jours
    const endsAt = new Date(now + Math.floor((24 + rand() * 96) * HOUR)); // se termine dans 1 à 5 jours
    await update(it, startsAt, endsAt, rand);
  }
  for (const it of upcoming) {
    const rand = rng(hash(`fenetre:${it.id}`));
    const startsAt = new Date(now + Math.floor((12 + rand() * 12 * 24) * HOUR)); // commence dans 12 h à ~12 jours
    const endsAt = new Date(startsAt.getTime() + Math.floor((2 + rand() * 3) * DAY)); // dure 2 à 5 jours
    await update(it, startsAt, endsAt, rand);
  }

  return { orders: orderRows.length, games: liveGames.length, livePromos: live.length, upcomingPromos: upcoming.length };
}
