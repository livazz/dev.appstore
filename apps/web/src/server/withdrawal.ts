import 'server-only';
import type Stripe from 'stripe';
import type { DeliveryStatus, OrderStatus } from '@devappstore/core';
import { and, db, deliveries, eq, games, gt, inArray, orders, studios } from '@devappstore/db';
import { DISPATCH_LEASE_MS, enqueueRefund, WITHDRAWAL_STOP_REASON } from './delivery';
import { revokePointsForOrder } from './loyalty';
import { runInBackground, sendWithdrawalAcknowledgement } from './notifications';
import { chargeAccountOf, refundPaymentIntent } from './payments';
import { getStripe, isSimulationAllowed, isStripeEnabled } from './stripe';

/*
 * Rétractation en ligne (« bouton de rétractation », directive (UE) 2023/2673 ; docs/legal/consumer.md § 2.4–2.5).
 *
 * Le droit subsiste tant que l'exécution n'a pas commencé : une commande payée dont la livraison est encore
 * `pending` (jeu hors ligne, webhook en relance) ou `failed` (relances épuisées : rien n'a été crédité) et passée il y
 * a moins de 14 jours (art. L221-18). Dès que le jeu a crédité l'achat (`delivered` / `acknowledged`), la renonciation
 * recueillie au paiement s'applique.
 *
 * Déroulé (`withdrawOrder`) :
 * 1. transaction, commande verrouillée (FOR UPDATE) : contrôle d'éligibilité et ARRÊT de la livraison
 *    (`pending` / `failed` → `failed` avec le motif WITHDRAWAL_STOP_REASON) par une mise à jour conditionnelle — une
 *    livraison confirmée entre-temps fait échouer la rétractation, jamais les deux ; une livraison arrêtée n'est plus
 *    relancée (ni par le cron, ni par le bouton « Relancer » du studio : `retryDelivery` reconnaît le motif) ;
 * 2. remboursement intégral : Stripe (clé d'idempotence par commande ; transfert et commission annulés) ou, en mode
 *    simulation, aucun mouvement d'argent ;
 * 3. commande `paid` → `refunded` (conditionnel) puis `enqueueRefund` : événement `purchase.refunded` par le même canal
 *    (le jeu révoque l'achat s'il l'avait crédité malgré tout, sinon l'ignore).
 * Si le remboursement Stripe échoue, la livraison reste arrêtée et le joueur peut relancer la rétractation
 * (une livraison arrêtée pour rétractation reste éligible) : la clé d'idempotence évite un double remboursement.
 * Le webhook `charge.refunded` qui suit est sans effet (commande déjà `refunded`).
 * 4. accusé de réception sur support durable (`sendWithdrawalAcknowledgement`, en arrière-plan : un échec d'envoi ne
 *    remet jamais en cause la rétractation, et l'envoi est idempotent par commande).
 */

export const WITHDRAWAL_PERIOD_MS = 14 * 24 * 3600_000;
/**
 * Motif posé sur la livraison arrêtée ; sert aussi à reconnaître une rétractation en cours (relance possible). Défini
 * dans delivery.ts (qui refuse de relancer une telle livraison) pour éviter un import circulaire.
 */
export { WITHDRAWAL_STOP_REASON };
/** Délai de remboursement annoncé au joueur (art. L221-24 : 14 jours au plus à compter de la demande). */
export const WITHDRAWAL_REFUND_DAYS = 14;

export type WithdrawalErrorCode =
  | 'not_found'
  | 'not_paid'
  | 'free_order'
  | 'period_expired'
  | 'already_delivered'
  | 'delivery_in_progress'
  | 'refund_failed'
  | 'refund_unavailable';

export const WITHDRAWAL_ERROR_MESSAGES: Record<WithdrawalErrorCode, string> = {
  not_found: 'Commande introuvable.',
  not_paid: 'Cette commande n’est pas (ou plus) payée : rien à rembourser.',
  free_order: 'Cet objet offert n’a pas été payé : rien à rembourser.',
  period_expired: 'Le délai de rétractation de 14 jours est dépassé.',
  already_delivered: 'L’achat a déjà été livré dans le jeu : la rétractation n’est plus possible (vous y avez renoncé lors du paiement).',
  delivery_in_progress: 'L’achat est en cours d’envoi au jeu : réessayez dans un instant.',
  refund_failed: 'Le remboursement n’a pas pu être lancé. La livraison est suspendue : réessayez dans un instant ou contactez le support.',
  refund_unavailable: 'Le remboursement en ligne est indisponible pour le moment : contactez le support.',
};

export class WithdrawalError extends Error {
  constructor(readonly code: WithdrawalErrorCode) {
    super(WITHDRAWAL_ERROR_MESSAGES[code]);
    this.name = 'WithdrawalError';
  }
}

export interface WithdrawalCandidate {
  status: OrderStatus;
  amountCents: number;
  createdAt: Date;
  deliveryStatus: DeliveryStatus | null;
  deliveryLastError: string | null;
}

/** Raison du refus, ou null si la commande est rétractable à `now`. */
export function withdrawalBlocker(o: WithdrawalCandidate, now = new Date()): WithdrawalErrorCode | null {
  if (o.status !== 'paid') return 'not_paid';
  if (o.amountCents <= 0) return 'free_order';
  if (o.createdAt.getTime() <= now.getTime() - WITHDRAWAL_PERIOD_MS) return 'period_expired';
  // `failed` : relances épuisées (rien n'a été crédité) ou livraison déjà arrêtée pour rétractation (relance du remboursement).
  if (o.deliveryStatus !== 'pending' && o.deliveryStatus !== 'failed') return 'already_delivered';
  return null;
}

export const canWithdraw = (o: WithdrawalCandidate, now = new Date()) => withdrawalBlocker(o, now) === null;

/** Parmi `orderIds`, commandes de l'utilisateur rétractables maintenant (pour afficher le bouton « Me rétracter »). */
export async function withdrawableOrderIds(userId: string, orderIds: string[], now = new Date()): Promise<Set<string>> {
  if (!orderIds.length) return new Set();
  const rows = await db
    .select({
      id: orders.id,
      status: orders.status,
      amountCents: orders.amountCents,
      createdAt: orders.createdAt,
      deliveryStatus: deliveries.status,
      deliveryLastError: deliveries.lastError,
    })
    .from(orders)
    .innerJoin(deliveries, eq(deliveries.orderId, orders.id))
    .where(
      and(
        eq(orders.userId, userId),
        inArray(orders.id, orderIds),
        eq(orders.status, 'paid'),
        gt(orders.amountCents, 0),
        gt(orders.createdAt, new Date(now.getTime() - WITHDRAWAL_PERIOD_MS)),
      ),
    );
  return new Set(rows.filter((r) => canWithdraw(r, now)).map((r) => r.id));
}

type StripeLike = {
  refunds: Pick<Stripe['refunds'], 'create'>;
  paymentIntents: Pick<Stripe['paymentIntents'], 'retrieve'>;
  checkout: { sessions: Pick<Stripe['checkout']['sessions'], 'retrieve'> };
};

export interface WithdrawalDeps {
  now?: Date;
  /** Client Stripe ; null = mode simulation. Par défaut : getStripe() si Stripe est configuré, sinon simulation. */
  stripe?: StripeLike | null;
  /** Mode simulation autorisé (jamais en production). Par défaut : isSimulationAllowed(). */
  simulationAllowed?: boolean;
  /** Envoi de l'accusé de réception par e-mail (défaut : oui, en arrière-plan). */
  acknowledge?: boolean;
}

export interface WithdrawalResult {
  orderId: string;
  mode: 'stripe' | 'simulation';
  refundId: string | null;
  refundDeliveryId: string | null;
}

const refId = (x: string | { id: string } | null | undefined) => (typeof x === 'string' ? x : (x?.id ?? null));

/** Rétractation d'une commande par son acheteur (cf. en-tête du module). */
export async function withdrawOrder(userId: string, orderId: string, deps: WithdrawalDeps = {}): Promise<WithdrawalResult> {
  const now = deps.now ?? new Date();
  if (typeof orderId !== 'string' || !orderId || orderId.length > 64) throw new WithdrawalError('not_found');

  // 1. Contrôle et arrêt de la livraison, atomiques (commande verrouillée, mise à jour conditionnelle de la livraison).
  const locked = await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .for('update');
    if (!order) throw new WithdrawalError('not_found');
    // Livraison verrouillée : un envoi ne peut pas prendre son bail entre le contrôle et l'arrêt.
    const [dlv] = await tx
      .select({ id: deliveries.id, status: deliveries.status, lastError: deliveries.lastError, nextAttemptAt: deliveries.nextAttemptAt })
      .from(deliveries)
      .where(eq(deliveries.orderId, orderId))
      .for('update');
    const blocker = withdrawalBlocker({ ...order, deliveryStatus: dlv?.status ?? null, deliveryLastError: dlv?.lastError ?? null }, now);
    if (blocker) throw new WithdrawalError(blocker);
    // Envoi webhook en vol (bail posé par dispatch, ou relance imminente) : le jeu pourrait créditer l'achat pendant
    // qu'on le rembourse. On refuse pour quelques secondes (revue 2026-11, C-7).
    if (dlv!.status === 'pending' && isDispatchLeased(dlv!.nextAttemptAt, new Date())) throw new WithdrawalError('delivery_in_progress');
    if (!(dlv!.status === 'failed' && dlv!.lastError === WITHDRAWAL_STOP_REASON)) {
      // pending (en attente / en relance) ou failed (relances épuisées) → arrêt définitif, conditionnel : une livraison
      // passée à delivered entre-temps (webhook 2xx, récupération par le SDK) fait échouer la rétractation.
      const [stopped] = await tx
        .update(deliveries)
        .set({ status: 'failed', nextAttemptAt: null, lastError: WITHDRAWAL_STOP_REASON })
        .where(and(eq(deliveries.id, dlv!.id), inArray(deliveries.status, ['pending', 'failed'])))
        .returning({ id: deliveries.id });
      if (!stopped) throw new WithdrawalError('already_delivered');
    }
    const [studio] = await tx
      .select({ stripeAccountId: studios.stripeAccountId })
      .from(games)
      .innerJoin(studios, eq(studios.id, games.studioId))
      .where(eq(games.id, order.gameId));
    return { order, studio: studio ?? { stripeAccountId: null } };
  });

  // 2. Remboursement intégral.
  const stripe = deps.stripe !== undefined ? deps.stripe : isStripeEnabled() ? getStripe() : null;
  let refundIdValue: string | null = null;
  let mode: WithdrawalResult['mode'] = 'simulation';
  if (stripe) {
    mode = 'stripe';
    try {
      refundIdValue = await refundOnStripe(stripe, locked.order, locked.studio);
    } catch (e) {
      console.error('[withdrawal] remboursement Stripe impossible', orderId, e instanceof Error ? e.message : 'erreur inconnue');
      throw new WithdrawalError('refund_failed');
    }
  } else if (!(deps.simulationAllowed ?? isSimulationAllowed())) {
    console.error('[withdrawal] ni Stripe ni simulation : remboursement impossible', orderId);
    throw new WithdrawalError('refund_unavailable');
  }

  // 3. Commande remboursée puis événement `purchase.refunded` (même canal que l'achat).
  const [refunded] = await db
    .update(orders)
    .set({ status: 'refunded', refundedAt: now })
    .where(and(eq(orders.id, orderId), eq(orders.status, 'paid')))
    .returning({ id: orders.id });
  if (refunded) {
    // Reprise des points Dev AppStore de la commande (revue 2026-11, C-1) : sans elle, acheter puis se rétracter
    // laissait les points. Idempotent ; ne remet jamais en cause la rétractation.
    await revokePointsForOrder(orderId, { note: 'rétractation' }).catch((e) =>
      console.error('[withdrawal] reprise des points impossible', orderId, e instanceof Error ? e.message : 'erreur inconnue'),
    );
  }
  let refundDeliveryId: string | null = null;
  try {
    refundDeliveryId = await enqueueRefund(orderId);
  } catch (e) {
    // La commande est remboursée : le webhook charge.refunded (ou la relance) réémettra l'événement.
    console.error('[withdrawal] enqueueRefund', orderId, e instanceof Error ? e.message : 'erreur inconnue');
  }
  // 4. Accusé de réception sur support durable (directive 2023/2673) — jamais bloquant.
  if (deps.acknowledge !== false) {
    runInBackground('accusé de rétractation', () =>
      sendWithdrawalAcknowledgement(orderId, { requestedAt: now, refundDays: WITHDRAWAL_REFUND_DAYS, simulated: mode === 'simulation' }),
    );
  }
  return { orderId, mode, refundId: refundIdValue, refundDeliveryId };
}

/**
 * Bail d'envoi actif (ou relance due dans la fenêtre du bail) : `dispatch` pose nextAttemptAt = maintenant + bail avant
 * le POST au serveur du studio. Une livraison garée (SDK, nextAttemptAt null) ou en attente d'une relance lointaine
 * n'est pas concernée.
 */
export function isDispatchLeased(nextAttemptAt: Date | null, now: Date): boolean {
  if (!nextAttemptAt) return false;
  const t = nextAttemptAt.getTime();
  return t > now.getTime() && t <= now.getTime() + DISPATCH_LEASE_MS + 1_000;
}

/**
 * Remboursement Stripe intégral, idempotent par commande, sur le compte qui a encaissé le paiement (figé sur la
 * commande : un studio dont les paiements ont été désactivés depuis reste remboursable — C-3).
 */
async function refundOnStripe(stripe: StripeLike, order: typeof orders.$inferSelect, studio: { stripeAccountId: string | null }): Promise<string> {
  const account = chargeAccountOf(order, studio);
  let paymentIntent = order.stripePaymentIntentId;
  if (!paymentIntent && order.stripeCheckoutSessionId) {
    const session = await stripe.checkout.sessions.retrieve(order.stripeCheckoutSessionId, {}, account ? { stripeAccount: account } : {});
    paymentIntent = refId(session.payment_intent);
  }
  if (!paymentIntent) throw new Error(`paiement Stripe introuvable pour ${order.id}`);
  return refundPaymentIntent(stripe, paymentIntent, {
    account,
    reason: 'requested_by_customer',
    metadata: { order_id: order.id, devappstore_reason: 'withdrawal' },
    idempotencyKey: `devappstore_withdrawal_${order.id}`,
  });
}
