import 'server-only';
import type Stripe from 'stripe';
import type { DeliveryStatus, OrderStatus } from '@wolleen/core';
import { and, db, deliveries, eq, games, gt, inArray, orders, studios } from '@wolleen/db';
import { enqueueRefund } from './delivery';
import { checkoutRequestOptions } from './payments';
import { getStripe, isSimulationAllowed, isStripeEnabled } from './stripe';

/*
 * Rétractation en ligne (« bouton de rétractation », directive (UE) 2023/2673 ; docs/legal/consumer.md § 2.4–2.5).
 *
 * Le droit subsiste tant que l'exécution n'a pas commencé : une commande payée dont la livraison est encore
 * `pending` (jeu hors ligne, webhook en relance) et passée il y a moins de 14 jours (art. L221-18). Dès que le jeu a
 * crédité l'achat (`delivered` / `acknowledged`), la renonciation recueillie au paiement s'applique.
 *
 * Déroulé (`withdrawOrder`) :
 * 1. transaction, commande verrouillée (FOR UPDATE) : contrôle d'éligibilité et ARRÊT de la livraison
 *    (`pending` → `failed` avec le motif WITHDRAWAL_STOP_REASON) par une mise à jour conditionnelle — une livraison
 *    confirmée entre-temps fait échouer la rétractation, jamais les deux ;
 * 2. remboursement intégral : Stripe (clé d'idempotence par commande ; transfert et commission annulés) ou, en mode
 *    simulation, aucun mouvement d'argent ;
 * 3. commande `paid` → `refunded` (conditionnel) puis `enqueueRefund` : événement `purchase.refunded` par le même canal
 *    (le jeu révoque l'achat s'il l'avait crédité malgré tout, sinon l'ignore).
 * Si le remboursement Stripe échoue, la livraison reste arrêtée et le joueur peut relancer la rétractation
 * (une livraison arrêtée pour rétractation reste éligible) : la clé d'idempotence évite un double remboursement.
 * Le webhook `charge.refunded` qui suit est sans effet (commande déjà `refunded`).
 */

export const WITHDRAWAL_PERIOD_MS = 14 * 24 * 3600_000;
/** Motif posé sur la livraison arrêtée ; sert aussi à reconnaître une rétractation en cours (relance possible). */
export const WITHDRAWAL_STOP_REASON = 'Rétractation du joueur : livraison arrêtée avant exécution.';

export type WithdrawalErrorCode = 'not_found' | 'not_paid' | 'free_order' | 'period_expired' | 'already_delivered' | 'refund_failed' | 'refund_unavailable';

export const WITHDRAWAL_ERROR_MESSAGES: Record<WithdrawalErrorCode, string> = {
  not_found: 'Commande introuvable.',
  not_paid: 'Cette commande n’est pas (ou plus) payée : rien à rembourser.',
  free_order: 'Cet objet offert n’a pas été payé : rien à rembourser.',
  period_expired: 'Le délai de rétractation de 14 jours est dépassé.',
  already_delivered: 'L’achat a déjà été livré dans le jeu : la rétractation n’est plus possible (vous y avez renoncé lors du paiement).',
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
  const stoppedForWithdrawal = o.deliveryStatus === 'failed' && o.deliveryLastError === WITHDRAWAL_STOP_REASON;
  if (o.deliveryStatus !== 'pending' && !stoppedForWithdrawal) return 'already_delivered';
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
    const [dlv] = await tx.select({ id: deliveries.id, status: deliveries.status, lastError: deliveries.lastError }).from(deliveries).where(eq(deliveries.orderId, orderId));
    const blocker = withdrawalBlocker({ ...order, deliveryStatus: dlv?.status ?? null, deliveryLastError: dlv?.lastError ?? null }, now);
    if (blocker) throw new WithdrawalError(blocker);
    if (dlv!.status === 'pending') {
      const [stopped] = await tx
        .update(deliveries)
        .set({ status: 'failed', nextAttemptAt: null, lastError: WITHDRAWAL_STOP_REASON })
        .where(and(eq(deliveries.id, dlv!.id), eq(deliveries.status, 'pending')))
        .returning({ id: deliveries.id });
      if (!stopped) throw new WithdrawalError('already_delivered');
    }
    const [studio] = await tx
      .select({ stripeAccountId: studios.stripeAccountId, stripeChargesEnabled: studios.stripeChargesEnabled })
      .from(games)
      .innerJoin(studios, eq(studios.id, games.studioId))
      .where(eq(games.id, order.gameId));
    return { order, studio: studio ?? { stripeAccountId: null, stripeChargesEnabled: false } };
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
  await db
    .update(orders)
    .set({ status: 'refunded', refundedAt: now })
    .where(and(eq(orders.id, orderId), eq(orders.status, 'paid')));
  let refundDeliveryId: string | null = null;
  try {
    refundDeliveryId = await enqueueRefund(orderId);
  } catch (e) {
    // La commande est remboursée : le webhook charge.refunded (ou la relance) réémettra l'événement.
    console.error('[withdrawal] enqueueRefund', orderId, e instanceof Error ? e.message : 'erreur inconnue');
  }
  return { orderId, mode, refundId: refundIdValue, refundDeliveryId };
}

/**
 * Remboursement Stripe intégral, idempotent par commande. Charge directe : sur le compte du studio, commission
 * remboursée ; charge à destination : transfert au studio annulé et commission remboursée.
 */
async function refundOnStripe(
  stripe: StripeLike,
  order: typeof orders.$inferSelect,
  studio: { stripeAccountId: string | null; stripeChargesEnabled: boolean },
): Promise<string> {
  const { stripeAccount } = checkoutRequestOptions(order.id, studio);
  const accountOpts: Stripe.RequestOptions = stripeAccount ? { stripeAccount } : {};
  let paymentIntent = order.stripePaymentIntentId;
  if (!paymentIntent && order.stripeCheckoutSessionId) {
    const session = await stripe.checkout.sessions.retrieve(order.stripeCheckoutSessionId, {}, accountOpts);
    paymentIntent = refId(session.payment_intent);
  }
  if (!paymentIntent) throw new Error(`paiement Stripe introuvable pour ${order.id}`);
  const params: Stripe.RefundCreateParams = {
    payment_intent: paymentIntent,
    reason: 'requested_by_customer',
    metadata: { order_id: order.id, wolleen_reason: 'withdrawal' },
  };
  if (stripeAccount) params.refund_application_fee = true;
  else {
    const pi = await stripe.paymentIntents.retrieve(paymentIntent, {}, accountOpts);
    if (pi.transfer_data?.destination) {
      params.reverse_transfer = true;
      params.refund_application_fee = true;
    }
  }
  const refund = await stripe.refunds.create(params, { ...accountOpts, idempotencyKey: `wolleen_withdrawal_${order.id}` });
  return refund.id;
}
