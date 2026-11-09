import 'server-only';
import { newId, type PurchaseEvent } from '@wolleen/core';
import { db, deliveries, eq, games, orders } from '@wolleen/db';

/**
 * CONTRAT PARTAGÉ — appelé par la tâche « payments » dès qu'une commande passe à `paid`.
 * Crée la livraison (idempotent : une seule par commande) puis déclenche l'envoi.
 * Propriétaire : tâche « delivery » (qui complète dispatchDelivery : webhook signé, retries, temps réel SDK).
 */
export async function enqueueDelivery(orderId: string): Promise<string> {
  const existing = await db.query.deliveries.findFirst({ where: (t, { eq }) => eq(t.orderId, orderId) });
  if (existing) return existing.id;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Commande inconnue : ${orderId}`);
  const [game] = await db.select({ id: games.id }).from(games).where(eq(games.id, order.gameId));
  if (!game) throw new Error(`Jeu inconnu : ${order.gameId}`);
  const item = await db.query.items.findFirst({ where: (t, { eq }) => eq(t.id, order.itemId) });
  const id = newId('dlv');
  const payload: PurchaseEvent = {
    event: 'purchase.completed',
    delivery_id: id,
    order_id: order.id,
    game_id: order.gameId,
    player_id: order.playerId,
    product_id: order.productId,
    item_type: item?.type ?? 'consumable',
    quantity: order.quantity,
    amount_cents: order.amountCents,
    currency: order.currency,
    created_at: new Date().toISOString(),
  };
  await db.insert(deliveries).values({ id, orderId, gameId: order.gameId, playerId: order.playerId, payload, nextAttemptAt: new Date() }).onConflictDoNothing();
  await dispatchDelivery(id);
  return id;
}

/** Envoie (ou ré-envoie) une livraison. Implémentation complète : tâche « delivery ». */
export async function dispatchDelivery(deliveryId: string): Promise<void> {
  void deliveryId;
}
