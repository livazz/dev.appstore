import 'server-only';
import { SIGNATURE_HEADER, newId, nextAttemptAt, signPayload, type PurchaseEvent } from '@wolleen/core';
import { and, asc, db, deliveries, desc, eq, games, inArray, isNull, lte, ne, or, orders, sql, webhookAttempts } from '@wolleen/db';
import { publish } from './events';

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

/* ------------------------------------------------------------------------------------------------
 * Envoi (webhook signé + temps réel SDK)
 * ---------------------------------------------------------------------------------------------- */

/** Délai maximum d'une requête webhook. */
export const WEBHOOK_TIMEOUT_MS = 10_000;
/** Bail posé sur une livraison pendant l'envoi (> timeout) pour éviter les doubles envois concurrents (cron + boucle dev). */
const DISPATCH_LEASE_MS = 30_000;
/** Intervalle de la boucle de relance en développement (le premier délai du planning est 10 s). */
const DEV_RETRY_INTERVAL_MS = 5_000;

export interface WebhookResult {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
  durationMs: number;
}

/** POST JSON signé vers l'URL du studio. Ne lève jamais : renvoie le résultat. */
export async function postSignedWebhook(url: string, secret: string, body: string, extraHeaders: Record<string, string> = {}): Promise<WebhookResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Wolleen-Webhooks/1.0',
        [SIGNATURE_HEADER]: signPayload(body, secret),
        ...extraHeaders,
      },
      body,
      redirect: 'manual', // une redirection n'est pas un succès
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      cache: 'no-store',
    });
    await res.body?.cancel().catch(() => {});
    const ok = res.status >= 200 && res.status < 300;
    return { ok, statusCode: res.status, error: ok ? null : `HTTP ${res.status}`, durationMs: Date.now() - started };
  } catch (e) {
    const err = e as Error;
    const error = err.name === 'TimeoutError' || err.name === 'AbortError' ? `Délai dépassé (${WEBHOOK_TIMEOUT_MS / 1000} s)` : describeFetchError(err);
    return { ok: false, statusCode: null, error, durationMs: Date.now() - started };
  }
}

function describeFetchError(err: Error) {
  const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
  const detail = cause?.code ?? cause?.message;
  return (detail ? `${err.message} (${detail})` : err.message).slice(0, 500);
}

/**
 * Envoie (ou ré-envoie) une livraison.
 * - Jeu avec `webhookUrl` : POST signé (`Wolleen-Signature`), timeout 10 s, journal `webhook_attempts`.
 *   2xx → `delivered` ; échec → attempts+1 et relance planifiée (`nextAttemptAt` de core), `failed` quand le planning est épuisé.
 * - Jeu sans webhook : reste `pending` (le SDK la récupère via le flux SSE ou `GET /api/v1/deliveries`).
 * Dans les deux cas, les flux SSE du joueur sont notifiés au premier envoi.
 */
export async function dispatchDelivery(deliveryId: string): Promise<void> {
  ensureDevRetryLoop();
  const [d] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId));
  if (!d || d.status !== 'pending') return;
  const [game] = await db.select({ webhookUrl: games.webhookUrl, webhookSecret: games.webhookSecret }).from(games).where(eq(games.id, d.gameId));
  if (!game) return;

  if (!game.webhookUrl) {
    // Rien à pousser côté serveur : on retire la livraison de la file de relance et on prévient le SDK.
    await db.update(deliveries).set({ nextAttemptAt: null }).where(and(eq(deliveries.id, d.id), eq(deliveries.status, 'pending')));
    if (d.attempts === 0) publish(d.gameId, d.playerId, d.payload);
    return;
  }

  // Prise du bail : seule une exécution à la fois envoie cette livraison, et seulement si elle est due.
  const now = new Date();
  const [claimed] = await db
    .update(deliveries)
    .set({ nextAttemptAt: new Date(now.getTime() + DISPATCH_LEASE_MS) })
    .where(and(eq(deliveries.id, d.id), eq(deliveries.status, 'pending'), or(isNull(deliveries.nextAttemptAt), lte(deliveries.nextAttemptAt, now))))
    .returning({ attempts: deliveries.attempts });
  if (!claimed) return;

  if (claimed.attempts === 0) publish(d.gameId, d.playerId, d.payload);

  const url = game.webhookUrl;
  const result = await postSignedWebhook(url, game.webhookSecret, JSON.stringify(d.payload), { 'Wolleen-Delivery': d.id });
  await db.insert(webhookAttempts).values({
    id: newId('wha'),
    deliveryId: d.id,
    url,
    statusCode: result.statusCode,
    error: result.error,
    durationMs: result.durationMs,
  });

  const attempts = claimed.attempts + 1;
  if (result.ok) {
    await db
      .update(deliveries)
      .set({ status: 'delivered', attempts, deliveredAt: new Date(), lastError: null, nextAttemptAt: null })
      .where(and(eq(deliveries.id, d.id), eq(deliveries.status, 'pending')));
    return;
  }
  const next = nextAttemptAt(attempts);
  await db
    .update(deliveries)
    .set({ status: next ? 'pending' : 'failed', attempts, lastError: result.error, nextAttemptAt: next })
    .where(and(eq(deliveries.id, d.id), eq(deliveries.status, 'pending')));
}

/** Relance toutes les livraisons dont la prochaine tentative est due (cron + boucle dev). */
export async function retryDueDeliveries(limit = 50): Promise<{ processed: number; delivered: number; failed: number; pending: number }> {
  const due = await db
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(and(eq(deliveries.status, 'pending'), lte(deliveries.nextAttemptAt, new Date())))
    .orderBy(asc(deliveries.nextAttemptAt))
    .limit(limit);
  for (const { id } of due) {
    try {
      await dispatchDelivery(id);
    } catch (e) {
      console.error(`[delivery] relance ${id} en erreur`, e);
    }
  }
  const stats = { processed: due.length, delivered: 0, failed: 0, pending: 0 };
  if (due.length) {
    const rows = await db.select({ status: deliveries.status }).from(deliveries).where(inArray(deliveries.id, due.map((r) => r.id)));
    for (const r of rows) {
      if (r.status === 'delivered' || r.status === 'acknowledged') stats.delivered++;
      else if (r.status === 'failed') stats.failed++;
      else stats.pending++;
    }
  }
  return stats;
}

/** En développement, une boucle légère relance les livraisons dues sans cron. Démarrée au premier usage. */
export function ensureDevRetryLoop() {
  if (process.env.NODE_ENV !== 'development') return;
  const g = globalThis as unknown as { __wolleenDeliveryLoop?: ReturnType<typeof setInterval> };
  if (g.__wolleenDeliveryLoop) return;
  let running = false;
  g.__wolleenDeliveryLoop = setInterval(() => {
    if (running) return;
    running = true;
    retryDueDeliveries()
      .catch((e) => console.error('[delivery] boucle de relance dev', e))
      .finally(() => {
        running = false;
      });
  }, DEV_RETRY_INTERVAL_MS);
  g.__wolleenDeliveryLoop.unref?.();
}

/* ------------------------------------------------------------------------------------------------
 * API publique du jeu (SDK / serveur du studio)
 * ---------------------------------------------------------------------------------------------- */

type GameRef = { id: string; webhookUrl: string | null };

/**
 * Livraisons ouvertes d'un joueur (pending + delivered non acquittées), les plus anciennes d'abord.
 * Pour un jeu sans webhook, la récupération par le SDK vaut livraison : pending → delivered.
 */
export async function takeOpenDeliveries(game: GameRef, playerId: string, limit = 100): Promise<PurchaseEvent[]> {
  const rows = await db
    .select({ id: deliveries.id, status: deliveries.status, payload: deliveries.payload })
    .from(deliveries)
    .where(and(eq(deliveries.gameId, game.id), eq(deliveries.playerId, playerId), inArray(deliveries.status, ['pending', 'delivered'])))
    .orderBy(asc(deliveries.createdAt))
    .limit(limit);
  await markFetchedBySdk(game, rows.filter((r) => r.status === 'pending').map((r) => r.id));
  return rows.map((r) => r.payload);
}

/** Le SDK a reçu ces livraisons (flux ou liste). Sans webhook, elles passent à `delivered`. */
export async function markFetchedBySdk(game: GameRef, ids: string[]) {
  if (game.webhookUrl || ids.length === 0) return; // avec webhook, c'est le 2xx du serveur du studio qui fait foi
  await db
    .update(deliveries)
    .set({ status: 'delivered', deliveredAt: new Date(), nextAttemptAt: null })
    .where(and(eq(deliveries.gameId, game.id), inArray(deliveries.id, ids), eq(deliveries.status, 'pending')));
}

/**
 * Le jeu confirme avoir crédité le joueur. Idempotent : un second ack renvoie aussi `ok`.
 * Une livraison d'un autre jeu est traitée comme inexistante (`not_found`).
 * Un ack est accepté depuis pending, delivered et failed (le jeu peut avoir crédité via le SDK malgré un webhook en échec).
 */
export async function acknowledgeDelivery(gameId: string, deliveryId: string): Promise<'ok' | 'not_found'> {
  const updated = await db
    .update(deliveries)
    .set({ status: 'acknowledged', acknowledgedAt: new Date(), deliveredAt: sql`coalesce(${deliveries.deliveredAt}, now())`, nextAttemptAt: null })
    .where(and(eq(deliveries.id, deliveryId), eq(deliveries.gameId, gameId), ne(deliveries.status, 'acknowledged')))
    .returning({ id: deliveries.id });
  if (updated.length) return 'ok';
  const [row] = await db.select({ id: deliveries.id }).from(deliveries).where(and(eq(deliveries.id, deliveryId), eq(deliveries.gameId, gameId)));
  return row ? 'ok' : 'not_found';
}

/* ------------------------------------------------------------------------------------------------
 * Espace studio (onglet Intégration)
 * ---------------------------------------------------------------------------------------------- */

/** Dernières livraisons d'un jeu (journal de l'onglet Intégration). */
export async function listRecentDeliveries(gameId: string, limit = 50) {
  return db.select().from(deliveries).where(eq(deliveries.gameId, gameId)).orderBy(desc(deliveries.createdAt)).limit(limit);
}

/** Relance manuelle depuis le studio (pending ou failed) : tentative immédiate + nouvelle notification SDK. */
export async function retryDelivery(gameId: string, deliveryId: string): Promise<'ok' | 'not_found' | 'not_retryable'> {
  const [d] = await db.select().from(deliveries).where(and(eq(deliveries.id, deliveryId), eq(deliveries.gameId, gameId)));
  if (!d) return 'not_found';
  if (d.status !== 'pending' && d.status !== 'failed') return 'not_retryable';
  await db
    .update(deliveries)
    .set({ status: 'pending', nextAttemptAt: new Date() })
    .where(and(eq(deliveries.id, d.id), inArray(deliveries.status, ['pending', 'failed'])));
  if (d.attempts > 0) publish(d.gameId, d.playerId, d.payload); // au premier envoi, dispatchDelivery publie déjà
  await dispatchDelivery(d.id);
  return 'ok';
}

/** Envoie un événement de test signé au webhook du jeu (rien n'est enregistré en base). */
export async function sendTestWebhook(gameId: string): Promise<WebhookResult & { payload: PurchaseEvent | null }> {
  const [game] = await db.select().from(games).where(eq(games.id, gameId));
  if (!game?.webhookUrl) return { ok: false, statusCode: null, error: 'Aucune URL de webhook configurée.', durationMs: 0, payload: null };
  const payload: PurchaseEvent = {
    event: 'purchase.completed',
    delivery_id: newId('dlv_test'),
    order_id: newId('ord_test'),
    game_id: game.id,
    player_id: 'test_player',
    product_id: 'test_product',
    item_type: 'consumable',
    quantity: 1,
    amount_cents: 0,
    currency: game.currency,
    created_at: new Date().toISOString(),
  };
  const result = await postSignedWebhook(game.webhookUrl, game.webhookSecret, JSON.stringify(payload), { 'Wolleen-Test': '1' });
  return { ...result, payload };
}
