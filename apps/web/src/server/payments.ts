import 'server-only';
import type Stripe from 'stripe';
import { DEFAULT_PLATFORM_FEE_BPS, feeCents, newId, type Currency, type OrderStatus } from '@wolleen/core';
import { and, db, eq, games, inArray, isNull, items, orders, studios } from '@wolleen/db';
import { enqueueDelivery } from '@/server/delivery';
import { getGameLink } from '@/server/links';
import { getStripe, isProduction, isSimulationAllowed, isStripeEnabled } from '@/server/stripe';

/*
 * Paiement (tâche « payments ») — point critique.
 * Flux : POST /api/checkout → createCheckout() → Stripe Checkout (ou /checkout/mock en simulation)
 *        → webhook checkout.session.completed (ou bouton Payer de la simulation) → markOrderPaid() → enqueueDelivery().
 */

// ---------------------------------------------------------------------------------------------
// Commission
// ---------------------------------------------------------------------------------------------

/** Commission Wolleen en points de base : PLATFORM_FEE_BPS (entier 0–10 000) sinon DEFAULT_PLATFORM_FEE_BPS. */
export function platformFeeBps(raw: string | undefined = process.env.PLATFORM_FEE_BPS): number {
  const s = raw?.trim();
  if (!s) return DEFAULT_PLATFORM_FEE_BPS;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0 || n > 10_000) {
    console.warn(`[payments] PLATFORM_FEE_BPS invalide (« ${s} ») : ${DEFAULT_PLATFORM_FEE_BPS} utilisé.`);
    return DEFAULT_PLATFORM_FEE_BPS;
  }
  return n;
}

/** Commission plateforme en centimes pour un montant donné. */
export function computePlatformFee(amountCents: number, bps: number = platformFeeBps()): number {
  return feeCents(amountCents, bps);
}

/** Montant minimum accepté par Stripe par devise (centimes). */
export const MIN_CHARGE_CENTS: Record<Currency, number> = { EUR: 50, USD: 50, GBP: 30 };

// ---------------------------------------------------------------------------------------------
// Chemins
// ---------------------------------------------------------------------------------------------

export const gameItemPath = (slug: string, itemId: string) => `/games/${encodeURIComponent(slug)}?item=${encodeURIComponent(itemId)}`;
export const gameLinkPath = (slug: string, itemId: string) => `/games/${encodeURIComponent(slug)}/link?item=${encodeURIComponent(itemId)}`;
export const loginPath = (next: string) => `/login?next=${encodeURIComponent(next)}`;
export const mockCheckoutPath = (orderId: string) => `/checkout/mock?order=${encodeURIComponent(orderId)}`;
export const successPath = (orderId: string) => `/checkout/success?order=${encodeURIComponent(orderId)}`;

// ---------------------------------------------------------------------------------------------
// Création de la commande + session de paiement
// ---------------------------------------------------------------------------------------------

export type CheckoutErrorCode =
  | 'unauthenticated'
  | 'item_unavailable'
  | 'not_linked'
  | 'amount_too_low'
  | 'payments_unavailable'
  | 'payment_provider_error';

/** Erreur métier du checkout, traduite en réponse HTTP par la route. `redirect` : page où envoyer le joueur. */
export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;
  readonly status: number;
  readonly redirect?: string;
  constructor(code: CheckoutErrorCode, message: string, status: number, redirect?: string) {
    super(message);
    this.name = 'CheckoutError';
    this.code = code;
    this.status = status;
    this.redirect = redirect;
  }
}

type GameRow = typeof games.$inferSelect;
type StudioRow = typeof studios.$inferSelect;
type OrderRow = typeof orders.$inferSelect;

async function loadItemWithGame(itemId: string) {
  const [row] = await db
    .select({ item: items, game: games, studio: studios })
    .from(items)
    .innerJoin(games, eq(games.id, items.gameId))
    .innerJoin(studios, eq(studios.id, games.studioId))
    .where(eq(items.id, itemId));
  return row ?? null;
}

/** Slug du jeu d'un article (pour construire les redirections), ou null. */
export async function getItemGameSlug(itemId: string): Promise<string | null> {
  const [row] = await db.select({ slug: games.slug }).from(items).innerJoin(games, eq(games.id, items.gameId)).where(eq(items.id, itemId));
  return row?.slug ?? null;
}

export interface CheckoutSessionInput {
  order: Pick<OrderRow, 'id' | 'itemTitle' | 'productId' | 'playerId' | 'amountCents' | 'platformFeeCents' | 'currency' | 'gameId' | 'itemId'>;
  game: Pick<GameRow, 'name' | 'slug'>;
  studio: Pick<StudioRow, 'stripeAccountId' | 'stripeChargesEnabled'>;
  playerName?: string | null;
  customerEmail?: string | null;
  origin: string;
}

/**
 * Paramètres de la session Stripe Checkout. Paiement « destination » Connect si le studio a un compte
 * dont les paiements sont activés (commission = application_fee_amount), sinon encaissement sur la plateforme.
 */
export function buildCheckoutSessionParams(input: CheckoutSessionInput): Stripe.Checkout.SessionCreateParams {
  const { order, game, studio, origin } = input;
  const metadata = { order_id: order.id, game_id: order.gameId, item_id: order.itemId, player_id: order.playerId };
  const connect = studio.stripeAccountId && studio.stripeChargesEnabled ? studio.stripeAccountId : null;
  const who = input.playerName ? `${input.playerName} (${order.playerId})` : order.playerId;
  return {
    mode: 'payment',
    locale: 'fr',
    client_reference_id: order.id,
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: order.currency.toLowerCase(),
          unit_amount: order.amountCents,
          product_data: {
            name: order.itemTitle,
            description: `${game.name} — pour le joueur ${who}`.slice(0, 500),
            metadata: { product_id: order.productId },
          },
        },
      },
    ],
    metadata,
    payment_intent_data: {
      metadata,
      description: `Wolleen ${order.id} — ${game.name} — ${order.itemTitle}`.slice(0, 1000),
      ...(connect ? { application_fee_amount: order.platformFeeCents, transfer_data: { destination: connect } } : {}),
    },
    success_url: `${origin}${successPath(order.id)}`,
    cancel_url: `${origin}${gameItemPath(game.slug, order.itemId)}`,
  };
}

export interface CheckoutResult {
  orderId: string;
  url: string;
  mode: 'stripe' | 'simulation';
}

/**
 * Crée la commande `pending` (copie figée de l'article et du joueur) puis la session de paiement.
 * Lève CheckoutError (article indisponible, compte non lié, simulation interdite en production…).
 */
export async function createCheckout(params: { user: { id: string; email?: string | null }; itemId: string; origin: string }): Promise<CheckoutResult> {
  const { user, itemId, origin } = params;
  const stripeOn = isStripeEnabled();
  if (!stripeOn && isProduction()) {
    console.error('[payments] STRIPE_SECRET_KEY manquant en production : mode simulation refusé.');
    throw new CheckoutError('payments_unavailable', 'Le paiement est momentanément indisponible.', 503);
  }

  const row = await loadItemWithGame(itemId);
  if (!row || !row.item.active || row.game.status !== 'live') {
    throw new CheckoutError('item_unavailable', "Cet article n'est pas disponible à l'achat.", 404);
  }
  const { item, game, studio } = row;

  const link = await getGameLink(user.id, game.id);
  if (!link) {
    throw new CheckoutError('not_linked', 'Liez votre compte de jeu avant d’acheter.', 409, gameLinkPath(game.slug, item.id));
  }

  const amountCents = item.priceCents;
  if (!Number.isInteger(amountCents) || amountCents < MIN_CHARGE_CENTS[game.currency]) {
    throw new CheckoutError('amount_too_low', 'Le prix de cet article est inférieur au minimum accepté par le paiement.', 422);
  }

  const orderId = newId('ord');
  const [order] = await db
    .insert(orders)
    .values({
      id: orderId,
      userId: user.id,
      gameId: game.id,
      itemId: item.id,
      productId: item.productId,
      itemTitle: item.title,
      playerId: link.playerId,
      quantity: item.quantity,
      amountCents,
      platformFeeCents: computePlatformFee(amountCents),
      currency: game.currency,
      status: 'pending',
    })
    .returning();

  if (!stripeOn) return { orderId, url: mockCheckoutPath(orderId), mode: 'simulation' };

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create(
      buildCheckoutSessionParams({ order, game, studio, playerName: link.playerName, customerEmail: user.email, origin }),
      { idempotencyKey: `wolleen_checkout_${orderId}` },
    );
  } catch (e) {
    console.error('[payments] Échec de création de la session Stripe', orderId, e);
    await db.update(orders).set({ status: 'failed' }).where(and(eq(orders.id, orderId), eq(orders.status, 'pending')));
    throw new CheckoutError('payment_provider_error', 'Le service de paiement est indisponible, réessayez dans un instant.', 502);
  }
  if (!session.url) {
    await db.update(orders).set({ status: 'failed' }).where(eq(orders.id, orderId));
    throw new CheckoutError('payment_provider_error', 'Le service de paiement n’a pas renvoyé de page de paiement.', 502);
  }
  await db.update(orders).set({ stripeCheckoutSessionId: session.id }).where(eq(orders.id, orderId));
  return { orderId, url: session.url, mode: 'stripe' };
}

// ---------------------------------------------------------------------------------------------
// Passage à « payé »
// ---------------------------------------------------------------------------------------------

export interface MarkOrderPaidResult {
  orderId: string;
  /** true seulement pour l'appel qui a effectivement fait passer la commande à `paid`. */
  transitioned: boolean;
  status: OrderStatus;
  deliveryId: string | null;
}

/**
 * Marque la commande payée — IDEMPOTENT et sûr en concurrence : la transition pending→paid (paidAt) n'a lieu
 * qu'une fois (UPDATE … WHERE status IN ('pending','failed')). Un paiement confirmé après un échec technique
 * (failed) est honoré : l'argent a été encaissé, le joueur doit recevoir son achat.
 * enqueueDelivery() est appelé à chaque fois que la commande est payée (lui-même idempotent : une livraison par
 * commande), ce qui rattrape une livraison non créée si un appel précédent a échoué juste après la transition.
 */
export async function markOrderPaid(orderId: string, opts: { paymentIntentId?: string | null } = {}): Promise<MarkOrderPaidResult> {
  const pi = opts.paymentIntentId || null;
  const [updated] = await db
    .update(orders)
    .set({ status: 'paid', paidAt: new Date(), ...(pi ? { stripePaymentIntentId: pi } : {}) })
    .where(and(eq(orders.id, orderId), inArray(orders.status, ['pending', 'failed'])))
    .returning({ id: orders.id });

  if (updated) {
    const deliveryId = await enqueueDelivery(orderId);
    return { orderId, transitioned: true, status: 'paid', deliveryId };
  }

  const [existing] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
  if (!existing) throw new Error(`Commande inconnue : ${orderId}`);
  if (existing.status !== 'paid') {
    // ex. remboursée : on ne relivre pas.
    return { orderId, transitioned: false, status: existing.status, deliveryId: null };
  }
  if (pi) {
    await db.update(orders).set({ stripePaymentIntentId: pi }).where(and(eq(orders.id, orderId), isNull(orders.stripePaymentIntentId)));
  }
  const deliveryId = await enqueueDelivery(orderId);
  return { orderId, transitioned: false, status: 'paid', deliveryId };
}

/** Commande abandonnée/échouée (session expirée, paiement différé refusé). Ne touche jamais une commande payée. */
export async function markOrderFailed(orderId: string): Promise<boolean> {
  const rows = await db
    .update(orders)
    .set({ status: 'failed' })
    .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')))
    .returning({ id: orders.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------
// Mode simulation
// ---------------------------------------------------------------------------------------------

export class SimulationError extends Error {
  readonly code: 'simulation_forbidden' | 'order_not_found' | 'order_not_payable';
  constructor(code: SimulationError['code'], message: string) {
    super(message);
    this.name = 'SimulationError';
    this.code = code;
  }
}

/** Garde du mode simulation : jamais avec une clé Stripe (sinon paiement gratuit possible), jamais en production. */
export function assertSimulationAllowed(): void {
  if (!isSimulationAllowed()) {
    throw new SimulationError('simulation_forbidden', isStripeEnabled() ? 'Simulation désactivée : Stripe est configuré.' : 'Simulation interdite en production.');
  }
}

/** Bouton « Payer » de /checkout/mock : vérifie le mode, la propriété de la commande, puis markOrderPaid. */
export async function payMockOrder(userId: string, orderId: string): Promise<MarkOrderPaidResult> {
  assertSimulationAllowed();
  const [order] = await db.select({ status: orders.status }).from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
  if (!order) throw new SimulationError('order_not_found', 'Commande introuvable.');
  if (order.status !== 'pending' && order.status !== 'paid') throw new SimulationError('order_not_payable', 'Cette commande ne peut plus être payée.');
  return markOrderPaid(orderId);
}

// ---------------------------------------------------------------------------------------------
// Webhook Stripe
// ---------------------------------------------------------------------------------------------

export interface StripeEventResult {
  handled: boolean;
  detail: string;
}

const piId = (pi: string | Stripe.PaymentIntent | null) => (typeof pi === 'string' ? pi : (pi?.id ?? null));

/**
 * Applique une session Checkout (webhook ou resynchronisation au retour sur /checkout/success).
 * Contrôles : commande connue, même session, montant et devise identiques, paiement réellement reçu.
 */
export async function applyCheckoutSession(session: Stripe.Checkout.Session): Promise<StripeEventResult> {
  const orderId = session.metadata?.order_id || session.client_reference_id;
  if (!orderId) return { handled: false, detail: 'session sans order_id (pas une commande Wolleen)' };
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return { handled: false, detail: `commande inconnue ${orderId}` };
  if (order.stripeCheckoutSessionId && order.stripeCheckoutSessionId !== session.id) {
    console.error('[payments] Session Stripe inattendue pour la commande', orderId, session.id);
    return { handled: false, detail: 'session différente de celle de la commande' };
  }
  // amount_subtotal = montant des lignes avant taxes/remises (robuste à l'ajout futur de Stripe Tax).
  const paidAmount = session.amount_subtotal ?? session.amount_total;
  if (paidAmount !== order.amountCents || session.currency?.toLowerCase() !== order.currency.toLowerCase()) {
    console.error('[payments] Montant/devise incohérents — commande NON marquée payée, à vérifier', {
      orderId,
      expected: `${order.amountCents} ${order.currency}`,
      got: `${paidAmount} ${session.currency}`,
    });
    return { handled: false, detail: 'montant ou devise incohérents' };
  }
  if (session.payment_status !== 'paid') return { handled: false, detail: `paiement non finalisé (${session.payment_status})` };
  const r = await markOrderPaid(orderId, { paymentIntentId: piId(session.payment_intent) });
  return { handled: true, detail: r.transitioned ? 'commande payée' : `déjà traitée (${r.status})` };
}

/** Traite un événement Stripe dont la signature a été vérifiée. Lève une erreur → la route répond 500 (Stripe réessaie). */
export async function handleStripeEvent(event: Stripe.Event): Promise<StripeEventResult> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return applyCheckoutSession(event.data.object);

    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const session = event.data.object;
      const orderId = session.metadata?.order_id || session.client_reference_id;
      if (!orderId) return { handled: false, detail: 'session sans order_id' };
      const [order] = await db.select({ sessionId: orders.stripeCheckoutSessionId }).from(orders).where(eq(orders.id, orderId));
      if (!order || (order.sessionId && order.sessionId !== session.id)) return { handled: false, detail: 'commande ou session inconnue' };
      const changed = await markOrderFailed(orderId);
      return { handled: true, detail: changed ? 'commande échouée' : 'aucun changement' };
    }

    case 'account.updated': {
      const account = event.data.object;
      const rows = await db
        .update(studios)
        .set({ stripeChargesEnabled: Boolean(account.charges_enabled) })
        .where(eq(studios.stripeAccountId, account.id))
        .returning({ id: studios.id });
      return { handled: rows.length > 0, detail: rows.length ? `studio ${rows[0]!.id} : charges_enabled=${account.charges_enabled}` : 'compte inconnu' };
    }

    default:
      return { handled: false, detail: `événement ignoré (${event.type})` };
  }
}

/**
 * Au retour sur /checkout/success, si le webhook n'est pas encore arrivé (ou n'est pas configuré en local),
 * interroge Stripe directement (appel authentifié par la clé secrète) et applique la session.
 */
export async function syncOrderWithStripe(orderId: string): Promise<void> {
  if (!isStripeEnabled()) return;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.status !== 'pending' || !order.stripeCheckoutSessionId) return;
  try {
    const session = await getStripe().checkout.sessions.retrieve(order.stripeCheckoutSessionId);
    if (session.status === 'expired') await markOrderFailed(orderId);
    else await applyCheckoutSession(session);
  } catch (e) {
    console.error('[payments] Resynchronisation Stripe impossible', orderId, e);
  }
}

// ---------------------------------------------------------------------------------------------
// Lecture pour les pages joueur
// ---------------------------------------------------------------------------------------------

/** Commande de l'utilisateur avec son jeu, sa livraison et le nom du joueur (ou null si inconnue / pas à lui). */
export async function getOrderForUser(orderId: string, userId: string) {
  const [row] = await db
    .select({ order: orders, game: { id: games.id, name: games.name, slug: games.slug, iconUrl: games.iconUrl } })
    .from(orders)
    .innerJoin(games, eq(games.id, orders.gameId))
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
  if (!row) return null;
  const [delivery, link] = await Promise.all([
    db.query.deliveries.findFirst({ where: (t, { eq }) => eq(t.orderId, orderId) }),
    getGameLink(userId, row.order.gameId),
  ]);
  const playerName = link && link.playerId === row.order.playerId ? link.playerName : null;
  return { ...row, delivery: delivery ?? null, playerName };
}

export type OrderView = NonNullable<Awaited<ReturnType<typeof getOrderForUser>>>;
