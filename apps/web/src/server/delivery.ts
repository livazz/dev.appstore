import 'server-only';
import { promises as dnsPromises } from 'node:dns';
import { isIP } from 'node:net';
import { SIGNATURE_HEADER, newId, nextAttemptAt, signPayloadMulti, type PurchaseEvent } from '@devappstore/core';
import { and, asc, db, deliveries, desc, eq, games, inArray, isNull, lte, ne, or, orders, refundDeliveries, sql, webhookAttempts } from '@devappstore/db';
import { env } from '@/env';
import { publish } from './events';
import { BlockedAddressError, checkOutboundUrl, isBlockedAddress, safeHttpRequest } from './linking';
import { runInBackground, sendDeliveryFailed, sendPurchaseDelivered } from './notifications';
import { loadWebhookSecrets, signingSecrets } from './webhook-secrets';

/*
 * Livraison des achats aux jeux (propriétaire : tâche « delivery », durcie par « sec/delivery-keys »).
 *
 * Invariants de sécurité :
 * - seule une commande `paid` produit une livraison d'achat (`enqueueDelivery`), seule une commande `refunded`
 *   produit un événement `purchase.refunded` (`enqueueRefund`) ; une seule ligne de chaque par commande, créée
 *   atomiquement (insert … on conflict do nothing returning) : seul l'appel qui crée la ligne déclenche l'envoi ;
 * - un envoi webhook n'a lieu qu'après la prise atomique d'un bail sur la livraison (UPDATE … WHERE due RETURNING,
 *   et `FOR UPDATE SKIP LOCKED` dans le cron) : deux exécutions concurrentes n'envoient jamais la même livraison ;
 * - tout appel vers l'URL du studio passe par `safeHttpRequest` (anti-SSRF : https obligatoire en production, IP
 *   internes refusées à la résolution DNS, aucune redirection suivie, délai et taille bornés) ;
 * - `delivery_id` est la clé d'idempotence côté jeu, identique sur tous les canaux (webhook, SSE, liste).
 */

export type DeliveryKind = 'purchase' | 'refund';
const KINDS: DeliveryKind[] = ['purchase', 'refund'];
type DeliveryTable = typeof deliveries;
/**
 * `refund_deliveries` a exactement les colonnes de `deliveries` (+ `purchaseDeliveryId`) : les requêtes communes
 * (bail, statut, liste, ack) s'appliquent aux deux tables. Le transtypage ne change que le type TypeScript.
 */
const TABLES: Record<DeliveryKind, DeliveryTable> = {
  purchase: deliveries,
  refund: refundDeliveries as unknown as DeliveryTable,
};

export class DeliveryError extends Error {
  constructor(
    readonly code: 'order_not_found' | 'order_not_paid' | 'order_not_refunded',
    message: string,
  ) {
    super(message);
    this.name = 'DeliveryError';
  }
}

const isProduction = () => env.isProduction;

/**
 * E-mails au joueur (et alerte studio) sur les achats — jamais sur les remboursements, qui n'ont pas d'e-mail dédié.
 * En arrière-plan (runInBackground) : la livraison, l'ack et le flux du SDK ne les attendent pas. Idempotents.
 */
function notifyDelivered(kind: DeliveryKind, id: string) {
  if (kind === 'purchase') runInBackground(`livré ${id}`, () => sendPurchaseDelivered(id));
}
function notifyFailed(kind: DeliveryKind, id: string) {
  if (kind === 'purchase') runInBackground(`échec ${id}`, () => sendDeliveryFailed(id));
}

/**
 * CONTRAT PARTAGÉ — appelé par la tâche « payments » dès qu'une commande passe à `paid`.
 * Refuse toute commande non payée (DeliveryError `order_not_paid`). Idempotent et sûr en concurrence : une seule
 * livraison par commande ; seul l'appel qui l'a créée déclenche l'envoi, les autres renvoient l'id existant.
 */
export async function enqueueDelivery(orderId: string): Promise<string> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new DeliveryError('order_not_found', `Commande inconnue : ${orderId}`);
  if (order.status !== 'paid') {
    throw new DeliveryError('order_not_paid', `Commande ${orderId} non payée (statut « ${order.status} ») : livraison refusée.`);
  }
  const existing = await findPurchaseDeliveryId(orderId);
  if (existing) return existing;

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
  const [created] = await db
    .insert(deliveries)
    .values({ id, orderId, gameId: order.gameId, playerId: order.playerId, payload, nextAttemptAt: new Date() })
    .onConflictDoNothing({ target: deliveries.orderId })
    .returning({ id: deliveries.id });
  if (!created) {
    // Un appel concurrent a créé la livraison entre-temps : c'est lui qui l'envoie.
    const winner = await findPurchaseDeliveryId(orderId);
    if (!winner) throw new Error(`Livraison introuvable pour la commande ${orderId}`);
    return winner;
  }
  await dispatch('purchase', created.id, false);
  return created.id;
}

async function findPurchaseDeliveryId(orderId: string) {
  const [row] = await db.select({ id: deliveries.id }).from(deliveries).where(eq(deliveries.orderId, orderId));
  return row?.id ?? null;
}

/**
 * CONTRAT PARTAGÉ — appelé par la tâche « payments » quand une commande payée passe à `refunded`
 * (remboursement, litige). Émet un événement `purchase.refunded` par le même canal que l'achat (webhook signé,
 * flux SSE, liste du SDK, ack) : même `order_id`, `product_id`, `quantity`… que l'achat, `delivery_id` propre.
 * - refuse une commande non `refunded` (DeliveryError `order_not_refunded`) ;
 * - renvoie null si aucun achat n'a jamais été créé pour la commande (rien n'est parvenu au jeu) ;
 * - un achat encore non confirmé (pending/failed) est arrêté : il ne sera plus envoyé ni listé ;
 * - idempotent : un seul remboursement par commande.
 * Côté jeu : révoquer l'achat `order_id` s'il avait été crédité, sinon ignorer ; dédoublonner sur `delivery_id`.
 */
export async function enqueueRefund(orderId: string): Promise<string | null> {
  const [order] = await db.select({ id: orders.id, status: orders.status }).from(orders).where(eq(orders.id, orderId));
  if (!order) throw new DeliveryError('order_not_found', `Commande inconnue : ${orderId}`);
  if (order.status !== 'refunded') {
    throw new DeliveryError('order_not_refunded', `Commande ${orderId} non remboursée (statut « ${order.status} ») : événement refusé.`);
  }
  const [purchase] = await db.select().from(deliveries).where(eq(deliveries.orderId, orderId));
  if (!purchase) return null;

  await db
    .update(deliveries)
    .set({ status: 'failed', nextAttemptAt: null, lastError: 'Commande remboursée avant confirmation de la livraison.' })
    .where(and(eq(deliveries.id, purchase.id), eq(deliveries.status, 'pending')));

  const existing = await findRefundDeliveryId(orderId);
  if (existing) return existing;
  const id = newId('rfd');
  const payload: PurchaseEvent = { ...purchase.payload, event: 'purchase.refunded', delivery_id: id, created_at: new Date().toISOString() };
  const [created] = await db
    .insert(refundDeliveries)
    .values({ id, orderId, purchaseDeliveryId: purchase.id, gameId: purchase.gameId, playerId: purchase.playerId, payload, nextAttemptAt: new Date() })
    .onConflictDoNothing({ target: refundDeliveries.orderId })
    .returning({ id: refundDeliveries.id });
  if (!created) return findRefundDeliveryId(orderId);
  await dispatch('refund', created.id, false);
  return created.id;
}

async function findRefundDeliveryId(orderId: string) {
  const [row] = await db.select({ id: refundDeliveries.id }).from(refundDeliveries).where(eq(refundDeliveries.orderId, orderId));
  return row?.id ?? null;
}

/* ------------------------------------------------------------------------------------------------
 * Appels sortants vers le serveur du studio (anti-SSRF)
 * ---------------------------------------------------------------------------------------------- */

/** Délai maximum d'une requête webhook. */
export const WEBHOOK_TIMEOUT_MS = 10_000;
/** Seul le statut compte : on ne lit (ni ne stocke) que le début de la réponse. */
const WEBHOOK_RESPONSE_MAX_BYTES = 1024;
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

export type UrlCheck = { ok: true; url: URL } | { ok: false; message: string };

/**
 * Vérification statique d'une URL de webhook : http(s), sans identifiants, hôte non interne en production
 * (vérification partagée avec la liaison : `checkOutboundUrl`) et **https obligatoire en production**.
 */
export function checkWebhookUrl(raw: string, opts: { production?: boolean } = {}): UrlCheck {
  const production = opts.production ?? isProduction();
  if (raw.length > 2000) return { ok: false, message: 'URL trop longue.' };
  const shape = checkOutboundUrl(raw, !production);
  if (!shape.ok) return shape;
  if (production && shape.url.protocol !== 'https:') return { ok: false, message: "En production, l'URL du webhook doit être en https://." };
  return shape;
}

/** Validation à l'enregistrement : vérification statique + résolution DNS (en production, aucune adresse interne). */
export async function validateWebhookUrl(raw: string, opts: { production?: boolean } = {}): Promise<UrlCheck> {
  const production = opts.production ?? isProduction();
  const shape = checkWebhookUrl(raw, { production });
  if (!shape.ok || !production) return shape;
  const host = shape.url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return shape; // déjà contrôlée par checkOutboundUrl
  try {
    const addrs = await dnsPromises.lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address))) {
      return { ok: false, message: 'Ce nom de domaine pointe vers une adresse interne ou privée.' };
    }
  } catch {
    return { ok: false, message: 'Nom de domaine introuvable.' };
  }
  return shape;
}

/** Secrets de signature du jeu ; null si illisibles (BETTER_AUTH_SECRET changé) ou jeu introuvable. */
async function secretsForSigning(gameId: string): Promise<string[] | null> {
  try {
    const s = await loadWebhookSecrets(gameId);
    return s ? signingSecrets(s) : null;
  } catch (e) {
    console.error(`[delivery] secret webhook illisible pour ${gameId}`, e instanceof Error ? e.message : e);
    return null;
  }
}
const UNREADABLE_SECRET = 'Secret webhook illisible (clé de chiffrement changée) : régénérez-le dans l’onglet Intégration.';

/** Message d'erreur réseau normalisé (aucun détail interne : le journal ne doit pas servir d'oracle de scan). */
export function describeNetworkError(e: unknown): string {
  if (e instanceof BlockedAddressError) return 'Adresse refusée (réseau interne ou privé).';
  const err = (e ?? {}) as { name?: string; code?: unknown };
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return `Délai dépassé (${WEBHOOK_TIMEOUT_MS / 1000} s)`;
  const code = typeof err.code === 'string' ? err.code : '';
  if (code === 'ECONNREFUSED') return 'Connexion refusée';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Nom de domaine introuvable';
  if (code === 'ECONNRESET' || code === 'EPIPE') return 'Connexion interrompue';
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'Hôte injoignable';
  if (/CERT|TLS|SSL|SELF_SIGNED/.test(code)) return 'Erreur TLS (certificat refusé)';
  return 'Erreur réseau';
}

/** URL journalisée sans identifiants, query string ni fragment (peuvent contenir des secrets). */
function redactUrl(raw: string) {
  try {
    const u = new URL(raw);
    u.username = '';
    u.password = '';
    u.search = '';
    u.hash = '';
    return u.href;
  } catch {
    return '(URL invalide)';
  }
}

/**
 * POST JSON signé vers l'URL du studio. Ne lève jamais : renvoie le résultat.
 * La signature porte sur la chaîne exacte envoyée. Aucune redirection n'est suivie (3xx = échec).
 * Plusieurs secrets (rotation, F7) : un `v1=` par secret, le courant en premier.
 */
export async function postSignedWebhook(url: string, secret: string | string[], body: string, extraHeaders: Record<string, string> = {}): Promise<WebhookResult> {
  const started = Date.now();
  const production = isProduction();
  const shape = checkWebhookUrl(url, { production });
  if (!shape.ok) return { ok: false, statusCode: null, error: `URL refusée : ${shape.message}`, durationMs: 0 };
  try {
    const res = await safeHttpRequest(
      shape.url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'DevAppStore-Webhooks/1.0',
          [SIGNATURE_HEADER]: signPayloadMulti(body, Array.isArray(secret) ? secret : [secret]),
          ...extraHeaders,
        },
        body,
      },
      { allowPrivate: !production, timeoutMs: WEBHOOK_TIMEOUT_MS, maxBytes: WEBHOOK_RESPONSE_MAX_BYTES },
    );
    const ok = res.status >= 200 && res.status < 300;
    const error = ok ? null : res.status >= 300 && res.status < 400 ? `Redirection refusée (HTTP ${res.status})` : `HTTP ${res.status}`;
    return { ok, statusCode: res.status, error, durationMs: Date.now() - started };
  } catch (e) {
    return { ok: false, statusCode: null, error: describeNetworkError(e), durationMs: Date.now() - started };
  }
}

/* ------------------------------------------------------------------------------------------------
 * Envoi (webhook signé + temps réel SDK)
 * ---------------------------------------------------------------------------------------------- */

async function loadForDispatch(kind: DeliveryKind, id: string) {
  const t = TABLES[kind];
  const [row] = await db
    .select({ id: t.id, gameId: t.gameId, playerId: t.playerId, payload: t.payload, status: t.status, attempts: t.attempts, userId: orders.userId, orderStatus: orders.status })
    .from(t)
    .innerJoin(orders, eq(orders.id, t.orderId))
    .where(eq(t.id, id));
  return row ?? null;
}

async function findKind(id: string): Promise<DeliveryKind | null> {
  for (const kind of KINDS) {
    const t = TABLES[kind];
    const [row] = await db.select({ id: t.id }).from(t).where(eq(t.id, id));
    if (row) return kind;
  }
  return null;
}

/**
 * Envoie (ou ré-envoie) une livraison (achat ou remboursement).
 * - Jeu avec `webhookUrl` : bail atomique, POST signé (`DevAppStore-Signature`), journal `webhook_attempts`.
 *   2xx → `delivered` ; échec → attempts+1 et relance planifiée (`nextAttemptAt` de core), `failed` quand le planning est épuisé.
 * - Jeu sans webhook : reste `pending`, retirée de la file de relance (le SDK la récupère via le flux SSE ou la liste).
 * Les flux SSE du joueur sont notifiés au premier envoi.
 */
export async function dispatchDelivery(deliveryId: string): Promise<void> {
  ensureDevRetryLoop();
  const kind = await findKind(deliveryId);
  if (kind) await dispatch(kind, deliveryId, false);
}

/** `claimed` : le bail a déjà été pris (cron). */
async function dispatch(kind: DeliveryKind, id: string, claimed: boolean): Promise<void> {
  ensureDevRetryLoop();
  const row = await loadForDispatch(kind, id);
  if (!row || row.status !== 'pending') return;
  const t = TABLES[kind];
  const [game] = await db.select({ webhookUrl: games.webhookUrl }).from(games).where(eq(games.id, row.gameId));
  if (!game) return;
  const meta = { userId: row.userId };

  if (!game.webhookUrl) {
    // Rien à pousser côté serveur : la livraison sort de la file de relance (reprise si une URL est enregistrée,
    // cf. resumeParkedDeliveries). Seul l'appel qui la retire de la file prévient le SDK.
    const [parked] = await db
      .update(t)
      .set({ nextAttemptAt: null })
      .where(and(eq(t.id, id), eq(t.status, 'pending'), sql`${t.nextAttemptAt} is not null`))
      .returning({ id: t.id });
    if (parked) publish(row.gameId, row.playerId, row.payload, meta);
    return;
  }

  let attempts = row.attempts;
  if (!claimed) {
    // Prise du bail : seule une exécution à la fois envoie cette livraison, et seulement si elle est due.
    const now = new Date();
    const [lease] = await db
      .update(t)
      .set({ nextAttemptAt: new Date(now.getTime() + DISPATCH_LEASE_MS) })
      .where(and(eq(t.id, id), eq(t.status, 'pending'), or(isNull(t.nextAttemptAt), lte(t.nextAttemptAt, now))))
      .returning({ attempts: t.attempts });
    if (!lease) return;
    attempts = lease.attempts;
  }

  if (attempts === 0) publish(row.gameId, row.playerId, row.payload, meta);

  const secrets = await secretsForSigning(row.gameId);
  const result: WebhookResult = secrets
    ? await postSignedWebhook(game.webhookUrl, secrets, JSON.stringify(row.payload), { 'DevAppStore-Delivery': id })
    : { ok: false, statusCode: null, error: UNREADABLE_SECRET, durationMs: 0 };
  let purchaseDeliveryId = id;
  if (kind === 'refund') {
    const [r] = await db.select({ p: refundDeliveries.purchaseDeliveryId }).from(refundDeliveries).where(eq(refundDeliveries.id, id));
    purchaseDeliveryId = r?.p ?? id;
  }
  await db.insert(webhookAttempts).values({
    id: newId('wha'),
    deliveryId: purchaseDeliveryId,
    refundDeliveryId: kind === 'refund' ? id : null,
    url: redactUrl(game.webhookUrl),
    statusCode: result.statusCode,
    error: result.error,
    durationMs: result.durationMs,
  });

  const total = attempts + 1;
  if (result.ok) {
    const done = await db
      .update(t)
      .set({ status: 'delivered', attempts: total, deliveredAt: new Date(), lastError: null, nextAttemptAt: null })
      .where(and(eq(t.id, id), eq(t.status, 'pending')))
      .returning({ id: t.id });
    if (done.length) notifyDelivered(kind, id);
    return;
  }
  const next = nextAttemptAt(total);
  const updated = await db
    .update(t)
    .set({ status: next ? 'pending' : 'failed', attempts: total, lastError: result.error, nextAttemptAt: next })
    .where(and(eq(t.id, id), eq(t.status, 'pending')))
    .returning({ id: t.id });
  // Relances épuisées : échec définitif → e-mail au joueur + alerte (regroupée) au studio.
  if (!next && updated.length) notifyFailed(kind, id);
}

/**
 * Réserve atomiquement la prochaine livraison due (FOR UPDATE SKIP LOCKED + bail) : deux crons concurrents
 * ne prennent jamais la même. Renvoie son id, ou null s'il n'y en a pas.
 */
async function claimNextDue(kind: DeliveryKind, now: Date): Promise<string | null> {
  const t = TABLES[kind];
  const next = db
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.status, 'pending'), lte(t.nextAttemptAt, now)))
    .orderBy(asc(t.nextAttemptAt), asc(t.id))
    .limit(1)
    .for('update', { skipLocked: true });
  // Sous-requête SCALAIRE (évaluée une fois) : avec « id IN (… LIMIT 1) », Postgres peut la réévaluer pour chaque
  // ligne et réserver toutes les livraisons dues d'un coup.
  const [row] = await db
    .update(t)
    .set({ nextAttemptAt: new Date(now.getTime() + DISPATCH_LEASE_MS) })
    .where(and(eq(t.id, sql`(${next})`), eq(t.status, 'pending'), lte(t.nextAttemptAt, now)))
    .returning({ id: t.id });
  return row?.id ?? null;
}

/**
 * Relance les livraisons (achats puis remboursements) dont la prochaine tentative est due (cron + boucle dev).
 * Chaque livraison est réservée atomiquement avant l'envoi ; `concurrency` envois en parallèle au plus,
 * arrêt après `limit` livraisons ou `budgetMs` (le cron a 60 s).
 */
export async function retryDueDeliveries(
  limit = 50,
  opts: { concurrency?: number; budgetMs?: number } = {},
): Promise<{ processed: number; delivered: number; failed: number; pending: number }> {
  const started = Date.now();
  const budgetMs = opts.budgetMs ?? 45_000;
  const taken: { kind: DeliveryKind; id: string }[] = [];
  let remaining = limit;
  const worker = async () => {
    while (remaining > 0 && Date.now() - started < budgetMs) {
      remaining--;
      let job: { kind: DeliveryKind; id: string } | null = null;
      for (const kind of KINDS) {
        const id = await claimNextDue(kind, new Date());
        if (id) {
          job = { kind, id };
          break;
        }
      }
      if (!job) {
        remaining = 0;
        return;
      }
      taken.push(job);
      try {
        await dispatch(job.kind, job.id, true);
      } catch (e) {
        console.error(`[delivery] relance ${job.id} en erreur`, e); // le bail expire : nouvelle tentative plus tard
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 4) }, worker));

  const stats = { processed: taken.length, delivered: 0, failed: 0, pending: 0 };
  for (const kind of KINDS) {
    const ids = taken.filter((j) => j.kind === kind).map((j) => j.id);
    if (!ids.length) continue;
    const t = TABLES[kind];
    for (const r of await db.select({ status: t.status }).from(t).where(inArray(t.id, ids))) {
      if (r.status === 'delivered' || r.status === 'acknowledged') stats.delivered++;
      else if (r.status === 'failed') stats.failed++;
      else stats.pending++;
    }
  }
  return stats;
}

/** En développement, une boucle légère relance les livraisons dues sans cron. Démarrée au premier usage. */
export function ensureDevRetryLoop() {
  if (env.NODE_ENV !== 'development') return;
  const g = globalThis as unknown as { __devAppStoreDeliveryLoop?: ReturnType<typeof setInterval> };
  if (g.__devAppStoreDeliveryLoop) return;
  let running = false;
  g.__devAppStoreDeliveryLoop = setInterval(() => {
    if (running) return;
    running = true;
    retryDueDeliveries()
      .catch((e) => console.error('[delivery] boucle de relance dev', e))
      .finally(() => {
        running = false;
      });
  }, DEV_RETRY_INTERVAL_MS);
  g.__devAppStoreDeliveryLoop.unref?.();
}

/**
 * Le studio vient d'enregistrer une URL de webhook : les livraisons en attente du SDK (créées sans webhook, donc
 * hors de la file de relance) redeviennent dues et partent au prochain passage du cron / de la boucle de relance.
 * Renvoie le nombre de livraisons reprises.
 */
export async function resumeParkedDeliveries(gameId: string): Promise<number> {
  const [game] = await db.select({ webhookUrl: games.webhookUrl }).from(games).where(eq(games.id, gameId));
  if (!game?.webhookUrl) return 0;
  const now = new Date();
  let n = 0;
  for (const kind of KINDS) {
    const t = TABLES[kind];
    const rows = await db
      .update(t)
      .set({ nextAttemptAt: now })
      .where(and(eq(t.gameId, gameId), eq(t.status, 'pending'), isNull(t.nextAttemptAt)))
      .returning({ id: t.id });
    n += rows.length;
  }
  return n;
}

/* ------------------------------------------------------------------------------------------------
 * API publique du jeu (SDK / serveur du studio)
 * ---------------------------------------------------------------------------------------------- */

type GameRef = { id: string; webhookUrl: string | null };

/**
 * Portée d'un appel fait avec un jeton joueur (clé publique) : seulement les livraisons de `playerId`
 * achetées par le compte Dev AppStore `userId` (celui qui a lié l'appareil). Absente = clé secrète (tout le jeu).
 */
export interface PlayerScope {
  playerId: string;
  userId: string;
}

/** Restreint aux commandes de l'acheteur (jeton joueur). */
function buyerFilter(t: DeliveryTable, gameId: string, userId: string | undefined) {
  if (userId === undefined) return undefined;
  return inArray(t.orderId, db.select({ id: orders.id }).from(orders).where(and(eq(orders.gameId, gameId), eq(orders.userId, userId))));
}

/**
 * Livraisons ouvertes d'un joueur (pending + delivered non acquittées, achats et remboursements), les plus anciennes
 * d'abord. Pour un jeu sans webhook, la récupération par le SDK vaut livraison : pending → delivered.
 * `opts.userId` (jeton joueur) : seulement les achats de ce compte Dev AppStore.
 */
export async function takeOpenDeliveries(game: GameRef, playerId: string, limit = 100, opts: { userId?: string } = {}): Promise<PurchaseEvent[]> {
  const rows: { id: string; status: string; payload: PurchaseEvent; createdAt: Date; kind: DeliveryKind }[] = [];
  for (const kind of KINDS) {
    const t = TABLES[kind];
    const part = await db
      .select({ id: t.id, status: t.status, payload: t.payload, createdAt: t.createdAt })
      .from(t)
      .where(and(eq(t.gameId, game.id), eq(t.playerId, playerId), inArray(t.status, ['pending', 'delivered']), buyerFilter(t, game.id, opts.userId)))
      .orderBy(asc(t.createdAt))
      .limit(limit);
    for (const r of part) rows.push({ ...r, kind });
  }
  // Un remboursement suit toujours son achat (même horodatage possible : l'achat d'abord).
  rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.kind === b.kind ? 0 : a.kind === 'purchase' ? -1 : 1));
  const page = rows.slice(0, limit);
  await markFetchedBySdk(game, page.filter((r) => r.status === 'pending').map((r) => r.id));
  return page.map((r) => r.payload);
}

/** Le SDK a reçu ces livraisons (flux ou liste). Sans webhook, elles passent à `delivered`. */
export async function markFetchedBySdk(game: GameRef, ids: string[]) {
  if (game.webhookUrl || ids.length === 0) return; // avec webhook, c'est le 2xx du serveur du studio qui fait foi
  for (const kind of KINDS) {
    const t = TABLES[kind];
    const done = await db
      .update(t)
      .set({ status: 'delivered', deliveredAt: new Date(), nextAttemptAt: null })
      .where(and(eq(t.gameId, game.id), inArray(t.id, ids), eq(t.status, 'pending')))
      .returning({ id: t.id });
    for (const r of done) notifyDelivered(kind, r.id);
  }
}

/**
 * Le jeu confirme avoir crédité le joueur (ou révoqué, pour un remboursement). Idempotent : un second ack renvoie aussi `ok`.
 * Une livraison d'un autre jeu — ou, avec un jeton joueur, d'un autre joueur / acheteur — est traitée comme inexistante.
 * Un ack est accepté depuis pending, delivered et failed (le jeu peut avoir crédité via le SDK malgré un webhook en échec),
 * sauf pour un achat arrêté (commande non `paid`, rétractation) : réponse `ok` sans effet.
 */
export async function acknowledgeDelivery(gameId: string, deliveryId: string, scope?: PlayerScope): Promise<'ok' | 'not_found'> {
  for (const kind of KINDS) {
    const t = TABLES[kind];
    const where = and(
      eq(t.id, deliveryId),
      eq(t.gameId, gameId),
      scope ? eq(t.playerId, scope.playerId) : undefined,
      scope ? buyerFilter(t, gameId, scope.userId) : undefined,
    );
    // Revue 2026-11 (F4) : un achat arrêté (commande plus `paid` : remboursée, rétractée ; ou arrêt pour rétractation)
    // ne passe jamais à `acknowledged` — l'ack répond `ok` (idempotent) mais reste sans effet.
    const stillDeliverable =
      kind === 'purchase'
        ? and(
            inArray(t.orderId, db.select({ id: orders.id }).from(orders).where(and(eq(orders.gameId, gameId), eq(orders.status, 'paid')))),
            or(isNull(t.lastError), ne(t.lastError, WITHDRAWAL_STOP_REASON)),
          )
        : undefined;
    const updated = await db
      .update(t)
      .set({ status: 'acknowledged', acknowledgedAt: new Date(), deliveredAt: sql`coalesce(${t.deliveredAt}, now())`, nextAttemptAt: null })
      .where(and(where, ne(t.status, 'acknowledged'), stillDeliverable))
      .returning({ id: t.id });
    if (updated.length) {
      notifyDelivered(kind, deliveryId); // idempotent : sans effet si l'e-mail « livré » est déjà parti
      return 'ok';
    }
    const [row] = await db.select({ id: t.id }).from(t).where(where);
    if (row) return 'ok';
  }
  return 'not_found';
}

/* ------------------------------------------------------------------------------------------------
 * Espace studio (onglet Intégration)
 * ---------------------------------------------------------------------------------------------- */

/** Dernières livraisons d'achat d'un jeu. */
export async function listRecentDeliveries(gameId: string, limit = 50) {
  return db.select().from(deliveries).where(eq(deliveries.gameId, gameId)).orderBy(desc(deliveries.createdAt)).limit(limit);
}

export type DeliveryLogEntry = typeof deliveries.$inferSelect & { kind: DeliveryKind };

/** Journal de l'onglet Intégration : achats et remboursements, les plus récents d'abord. */
export async function listDeliveryLog(gameId: string, limit = 50): Promise<DeliveryLogEntry[]> {
  const [purchases, refunds] = await Promise.all([
    listRecentDeliveries(gameId, limit),
    db.select().from(refundDeliveries).where(eq(refundDeliveries.gameId, gameId)).orderBy(desc(refundDeliveries.createdAt)).limit(limit),
  ]);
  return [...purchases.map((d) => ({ ...d, kind: 'purchase' as const })), ...refunds.map((d) => ({ ...d, kind: 'refund' as const }))]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

/**
 * Relance manuelle depuis le studio (pending ou failed) : tentative immédiate + nouvelle notification SDK.
 * Un achat dont la commande n'est plus payée (remboursée) n'est jamais relancé, ni une livraison arrêtée pour
 * rétractation (motif WITHDRAWAL_STOP_REASON, remboursement éventuellement encore en cours).
 */
export async function retryDelivery(gameId: string, deliveryId: string): Promise<'ok' | 'not_found' | 'not_retryable'> {
  for (const kind of KINDS) {
    const t = TABLES[kind];
    const [d] = await db
      .select({ id: t.id, status: t.status, attempts: t.attempts, lastError: t.lastError, gameId: t.gameId, playerId: t.playerId, payload: t.payload, userId: orders.userId, orderStatus: orders.status })
      .from(t)
      .innerJoin(orders, eq(orders.id, t.orderId))
      .where(and(eq(t.id, deliveryId), eq(t.gameId, gameId)));
    if (!d) continue;
    if (d.status !== 'pending' && d.status !== 'failed') return 'not_retryable';
    if (kind === 'purchase' && (d.orderStatus !== 'paid' || d.lastError === WITHDRAWAL_STOP_REASON)) return 'not_retryable';
    const [reopened] = await db
      .update(t)
      .set({ status: 'pending', nextAttemptAt: new Date() })
      .where(
        and(
          eq(t.id, d.id),
          inArray(t.status, ['pending', 'failed']),
          // Rétractation intervenue entre la lecture et la mise à jour : la livraison reste arrêtée.
          kind === 'purchase' ? or(isNull(t.lastError), ne(t.lastError, WITHDRAWAL_STOP_REASON)) : undefined,
        ),
      )
      .returning({ id: t.id });
    if (!reopened) return 'not_retryable';
    if (d.attempts > 0) publish(d.gameId, d.playerId, d.payload, { userId: d.userId }); // au premier envoi, dispatch publie déjà
    await dispatch(kind, d.id, false);
    return 'ok';
  }
  return 'not_found';
}

/** Envoie un événement de test signé au webhook du jeu (rien n'est enregistré en base). Mêmes protections que les livraisons. */
export async function sendTestWebhook(gameId: string): Promise<WebhookResult & { payload: PurchaseEvent | null }> {
  const [game] = await db
    .select({ id: games.id, currency: games.currency, webhookUrl: games.webhookUrl })
    .from(games)
    .where(eq(games.id, gameId));
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
  const secrets = await secretsForSigning(game.id);
  if (!secrets) return { ok: false, statusCode: null, error: UNREADABLE_SECRET, durationMs: 0, payload: null };
  const result = await postSignedWebhook(game.webhookUrl, secrets, JSON.stringify(payload), { 'DevAppStore-Test': '1' });
  return { ...result, payload };
}

/**
 * Motif posé par la rétractation du joueur (withdrawal.ts) sur la livraison qu'elle arrête : une telle livraison n'est
 * plus jamais relancée (`retryDelivery`). Défini ici pour éviter un import circulaire withdrawal ↔ delivery.
 */
export const WITHDRAWAL_STOP_REASON = 'Rétractation du joueur : livraison arrêtée avant exécution.';
