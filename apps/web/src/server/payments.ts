import 'server-only';
import type Stripe from 'stripe';
import { DEFAULT_PLATFORM_FEE_BPS, feeCents, newId, type Currency, type OrderStatus } from '@devappstore/core';
import { and, count, db, eq, games, gt, inArray, isNull, items, lt, orders, stripeEvents, studios } from '@devappstore/db';
import { env } from '@/env';
import * as delivery from '@/server/delivery';
import { getGameLink } from '@/server/links';
import { awardPointsForOrder, revokePointsForOrder } from '@/server/loyalty';
import { sendPurchaseReceipt, WITHDRAWAL_WAIVER_LABEL } from '@/server/notifications';
import { CGV_VERSION } from '@/lib/legal-versions';
import {
  acceptsTestModeEvents,
  automaticTaxEnabled,
  chargeModel,
  getStripe,
  isProduction,
  isSimulationAllowed,
  isStripeEnabled,
  paymentsConfigMessage,
  paymentsConfigProblem,
  type ChargeModel,
} from '@/server/stripe';

/*
 * Paiement (tâche « payments ») — point critique.
 * Flux : POST /api/checkout → createCheckout() → Stripe Checkout (ou /checkout/mock en simulation)
 *        → webhook checkout.session.completed (ou bouton Payer de la simulation) → markOrderPaid() / payMockOrder()
 *        → reçu (sendPurchaseReceipt) → enqueueDelivery() → points Dev AppStore (awardPointsForOrder).
 * Remboursement / litige : markOrderRefunded() → reprise des points (revokePointsForOrder) → enqueueRefund().
 *
 * Garanties de sécurité (docs/security/review-checklist.md, section 7) :
 * - prix, devise, produit, jeu et joueur lus en base, jamais depuis le client (CHK-PAY-01) ;
 * - refus : article inactif, jeu non live, compte non lié, vendeur non prêt en production (CHK-PAY-02) ;
 * - simulation impossible en production, clé de test refusée en production (CHK-PAY-10/11) ;
 * - webhook : signature sur le corps brut, idempotence par event.id, montant/devise contrôlés (CHK-PAY-06/07/08) ;
 * - anti-spam : nombre de commandes pending limité par utilisateur, expiration après 24 h.
 */

// ---------------------------------------------------------------------------------------------
// Commission
// ---------------------------------------------------------------------------------------------

/** Plafond de la commission (points de base) : au-delà, la valeur est considérée comme une erreur de configuration. */
export const MAX_PLATFORM_FEE_BPS = 3000;

/**
 * Commission Dev AppStore en points de base : PLATFORM_FEE_BPS (entier 0–3000, validé par src/env.ts) sinon
 * DEFAULT_PLATFORM_FEE_BPS. `raw` : valeur brute à interpréter (tests, outillage).
 */
export function platformFeeBps(raw?: string): number {
  if (raw === undefined) return env.PLATFORM_FEE_BPS;
  const s = raw.trim();
  if (!s) return DEFAULT_PLATFORM_FEE_BPS;
  const n = Number(s);
  if (!/^\d+$/.test(s) || !Number.isInteger(n) || n < 0 || n > MAX_PLATFORM_FEE_BPS) {
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
// Anti-spam des commandes en attente
// ---------------------------------------------------------------------------------------------

/** Nombre maximum de commandes `pending` (non expirées) par utilisateur. */
export const MAX_PENDING_ORDERS_PER_USER = 5;
/** Durée de vie d'une commande `pending` : au-delà, elle passe à `failed` (la session Stripe expire avant). */
export const PENDING_ORDER_TTL_MS = 24 * 60 * 60 * 1000;
/** Durée de vie de la session Stripe Checkout (Stripe : entre 30 min et 24 h) — inférieure au TTL de la commande. */
export const CHECKOUT_SESSION_TTL_S = 23 * 60 * 60;

/**
 * Passe à `failed` les commandes `pending` créées il y a plus de 24 h (par lots bornés).
 * Appelée par GET /api/checkout/expire (cron, CRON_SECRET) et, pour l'utilisateur courant, avant chaque achat.
 */
export async function expireStalePendingOrders(opts: { now?: Date; userId?: string; limit?: number } = {}): Promise<number> {
  const cutoff = new Date((opts.now ?? new Date()).getTime() - PENDING_ORDER_TTL_MS);
  const limit = Math.max(1, Math.min(opts.limit ?? 500, 5000));
  const stale = and(eq(orders.status, 'pending'), lt(orders.createdAt, cutoff), opts.userId ? eq(orders.userId, opts.userId) : undefined);
  const ids = db.select({ id: orders.id }).from(orders).where(stale).limit(limit);
  const rows = await db
    .update(orders)
    .set({ status: 'failed' })
    .where(and(inArray(orders.id, ids), eq(orders.status, 'pending')))
    .returning({ id: orders.id });
  return rows.length;
}

async function countOpenPendingOrders(userId: string, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PENDING_ORDER_TTL_MS);
  const [row] = await db
    .select({ n: count() })
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.status, 'pending'), gt(orders.createdAt, cutoff)));
  return Number(row?.n ?? 0);
}

// ---------------------------------------------------------------------------------------------
// Consentement (droit de rétractation — docs/legal/consumer.md § 2.3)
// ---------------------------------------------------------------------------------------------

/** Version des CGV présentée au joueur (DEVAPPSTORE_CGV_VERSION pour la surcharger au déploiement). */
export const DEFAULT_TERMS_VERSION = `cgv-${CGV_VERSION}`;

export function currentTermsVersion(): string {
  const v = env.DEVAPPSTORE_CGV_VERSION;
  return v ? v.slice(0, 64) : DEFAULT_TERMS_VERSION;
}

/** Libellé exact de la case à cocher (affiché avant le bouton « Payer X € ») — défini avec le reçu qui le cite. */
export { WITHDRAWAL_WAIVER_LABEL };

/**
 * Tronque une IP pour la preuve de consentement (minimisation RGPD) : /24 en IPv4 (1.2.3.0), /48 en IPv6
 * (2001:db8:1::). Renvoie null si l'entrée n'est pas une IP.
 */
export function truncateIp(raw: string | null | undefined): string | null {
  let ip = raw?.trim() ?? '';
  if (!ip) return null;
  // [IPv6]:port ou IPv4:port
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracket) ip = bracket[1]!;
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(':'));
  ip = ip.replace(/%.*$/, ''); // zone IPv6
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) ip = mapped[1]!;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((p) => p > 255)) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (!/^[0-9a-f:]+$/i.test(ip) || !ip.includes(':')) return null;
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return `${groups
    .slice(0, 3)
    .map((g) => parseInt(g, 16).toString(16))
    .join(':')}::`;
}

/**
 * IP du client telle que vue par le proxy de l'hébergeur (premier élément de X-Forwarded-For, sinon X-Real-IP).
 * Valeur déclarative (falsifiable sans proxy de confiance) : sert de preuve d'appoint, jamais d'authentification.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return xff || headers.get('x-real-ip')?.trim() || null;
}

export interface CheckoutConsent {
  /** Case « livraison immédiate + renonciation au droit de rétractation » cochée par le joueur. */
  withdrawalWaiver: boolean;
  /** IP brute du client (tronquée avant stockage). */
  ip?: string | null;
}

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
  | 'consent_required'
  | 'item_unavailable'
  | 'not_linked'
  | 'amount_too_low'
  | 'too_many_pending'
  | 'seller_not_ready'
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
type LinkRow = NonNullable<Awaited<ReturnType<typeof getGameLink>>>;

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

/** Prix affiché sur le bouton « Payer X € » (article actif d'un jeu live, sinon null). Lu en base. */
export async function getPurchasableItemPrice(itemId: string, gameId?: string): Promise<{ priceCents: number; currency: Currency; title: string } | null> {
  const row = await loadItemWithGame(itemId);
  if (!row || !row.item.active || row.game.status !== 'live' || (gameId && row.game.id !== gameId)) return null;
  return { priceCents: row.item.priceCents, currency: row.game.currency, title: row.item.title };
}

/** Le compte Connect du studio peut-il encaisser (paiements activés chez Stripe) ? */
const connectAccountOf = (studio: Pick<StudioRow, 'stripeAccountId' | 'stripeChargesEnabled'>) =>
  studio.stripeAccountId && studio.stripeChargesEnabled ? studio.stripeAccountId : null;

export interface CheckoutSessionInput {
  order: Pick<OrderRow, 'id' | 'itemTitle' | 'productId' | 'playerId' | 'amountCents' | 'platformFeeCents' | 'currency' | 'gameId' | 'itemId'> &
    Partial<Pick<OrderRow, 'termsVersion'>>;
  game: Pick<GameRow, 'name' | 'slug'>;
  studio: Pick<StudioRow, 'stripeAccountId' | 'stripeChargesEnabled'>;
  link?: Pick<LinkRow, 'method' | 'verified'> | null;
  playerName?: string | null;
  customerEmail?: string | null;
  origin: string;
}

export interface CheckoutSessionOptions {
  model?: ChargeModel;
  automaticTax?: boolean;
  now?: Date;
}

/**
 * Paramètres de la session Stripe Checkout.
 * - `destination` (défaut) : paiement « destination » Connect si le studio a un compte dont les paiements sont
 *   activés (commission = application_fee_amount), sinon encaissement sur la plateforme (hors production seulement :
 *   createCheckout refuse ce cas en production).
 * - `direct` : la session est créée sur le compte du studio (voir checkoutRequestOptions) ; seule la commission
 *   est indiquée.
 * - Stripe Tax désactivé par défaut ; activé, le prix est traité TTC (tax_behavior inclusive) : le montant payé
 *   reste égal au prix affiché « Payer X € ».
 */
export function buildCheckoutSessionParams(input: CheckoutSessionInput, opts: CheckoutSessionOptions = {}): Stripe.Checkout.SessionCreateParams {
  const { order, game, studio, origin } = input;
  const model = opts.model ?? chargeModel();
  const tax = opts.automaticTax ?? automaticTaxEnabled();
  const now = opts.now ?? new Date();
  const metadata: Record<string, string> = {
    order_id: order.id,
    game_id: order.gameId,
    item_id: order.itemId,
    player_id: order.playerId,
    charge_model: model,
    ...(input.link ? { link_method: input.link.method, link_verified: String(input.link.verified) } : {}),
    ...(order.termsVersion ? { terms_version: order.termsVersion, withdrawal_waiver: 'accepted' } : {}),
  };
  const connect = connectAccountOf(studio);
  const who = input.playerName ? `${input.playerName} (${order.playerId})` : order.playerId;
  const transfer =
    model === 'direct'
      ? { application_fee_amount: order.platformFeeCents }
      : connect
        ? { application_fee_amount: order.platformFeeCents, transfer_data: { destination: connect } }
        : {};
  return {
    mode: 'payment',
    locale: 'fr',
    client_reference_id: order.id,
    expires_at: Math.floor(now.getTime() / 1000) + CHECKOUT_SESSION_TTL_S,
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: order.currency.toLowerCase(),
          unit_amount: order.amountCents,
          ...(tax ? { tax_behavior: 'inclusive' as const } : {}),
          product_data: {
            name: order.itemTitle,
            description: `${game.name} — pour le joueur ${who}`.slice(0, 500),
            metadata: { product_id: order.productId },
          },
        },
      },
    ],
    automatic_tax: { enabled: tax },
    custom_text: {
      submit: { message: 'Livraison immédiate dans le jeu : vous avez renoncé à votre droit de rétractation pour cet achat.' },
    },
    metadata,
    payment_intent_data: {
      metadata,
      description: `Dev AppStore ${order.id} — ${game.name} — ${order.itemTitle}`.slice(0, 1000),
      ...transfer,
    },
    success_url: `${origin}${successPath(order.id)}`,
    cancel_url: `${origin}${gameItemPath(game.slug, order.itemId)}`,
  };
}

/** Options de requête Stripe : clé d'idempotence, et compte du studio (`Stripe-Account`) en charge directe. */
export function checkoutRequestOptions(
  orderId: string,
  studio: Pick<StudioRow, 'stripeAccountId' | 'stripeChargesEnabled'>,
  model: ChargeModel = chargeModel(),
): Stripe.RequestOptions {
  const connect = connectAccountOf(studio);
  return { idempotencyKey: `devappstore_checkout_${orderId}`, ...(model === 'direct' && connect ? { stripeAccount: connect } : {}) };
}

/**
 * Seul point de création d'une session Checkout : applique CHARGE_MODEL et STRIPE_AUTOMATIC_TAX.
 * Le modèle de charge n'est jamais choisi ailleurs.
 */
export async function createCheckoutSession(input: CheckoutSessionInput, opts: CheckoutSessionOptions = {}): Promise<Stripe.Checkout.Session> {
  const model = opts.model ?? chargeModel();
  return getStripe().checkout.sessions.create(
    buildCheckoutSessionParams(input, { ...opts, model }),
    checkoutRequestOptions(input.order.id, input.studio, model),
  );
}

export interface CheckoutResult {
  orderId: string;
  url: string;
  mode: 'stripe' | 'simulation';
}

/**
 * Crée la commande `pending` (copie figée de l'article, du joueur et de la preuve de consentement) puis la session
 * de paiement. Lève CheckoutError (consentement absent, article indisponible, compte non lié, trop de commandes en
 * attente, paiements indisponibles…).
 */
export async function createCheckout(params: {
  user: { id: string; email?: string | null };
  itemId: string;
  origin: string;
  consent: CheckoutConsent;
}): Promise<CheckoutResult> {
  const { user, itemId, origin, consent } = params;
  if (consent?.withdrawalWaiver !== true) {
    throw new CheckoutError('consent_required', 'Cochez la case de livraison immédiate pour continuer.', 400);
  }
  const problem = paymentsConfigProblem();
  if (problem) {
    console.error(`[payments] ${paymentsConfigMessage(problem)}`);
    throw new CheckoutError('payments_unavailable', 'Le paiement est momentanément indisponible (configuration du serveur de paiement).', 503);
  }
  const stripeOn = isStripeEnabled();

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

  // Vendeur prêt : en charge directe, toujours ; en destination, en production (pas d'encaissement pour compte).
  const model = chargeModel();
  if (stripeOn && !connectAccountOf(studio) && (model === 'direct' || isProduction())) {
    throw new CheckoutError('seller_not_ready', 'Ce studio ne peut pas encore encaisser de paiements.', 409);
  }

  const now = new Date();
  await expireStalePendingOrders({ now, userId: user.id });
  if ((await countOpenPendingOrders(user.id, now)) >= MAX_PENDING_ORDERS_PER_USER) {
    throw new CheckoutError('too_many_pending', 'Trop de paiements en attente : terminez ou abandonnez-les avant d’en commencer un autre.', 429);
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
      withdrawalWaiverAt: now,
      termsVersion: currentTermsVersion(),
      consentIp: truncateIp(consent.ip),
    })
    .returning();

  if (!stripeOn) return { orderId, url: mockCheckoutPath(orderId), mode: 'simulation' };

  let session: Stripe.Checkout.Session;
  try {
    session = await createCheckoutSession(
      { order: order!, game, studio, link, playerName: link.playerName, customerEmail: user.email, origin },
      { model, now },
    );
  } catch (e) {
    console.error('[payments] Échec de création de la session Stripe', orderId, e instanceof Error ? e.message : 'erreur inconnue');
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
 * Suites d'une commande payée, dans l'ordre : reçu + preuve de consentement (e-mail, avant la livraison pour que le
 * joueur le reçoive en premier), livraison, points Dev AppStore. Chaque étape est idempotente (une fois par commande) :
 * rappeler cette fonction rattrape une étape interrompue. Le reçu et les points ne lèvent jamais ; une erreur de
 * livraison remonte (le webhook Stripe sera rejoué).
 */
async function afterOrderPaid(orderId: string): Promise<string> {
  await sendPurchaseReceipt(orderId); // ne lève jamais, idempotent (notifications_sent)
  const deliveryId = await delivery.enqueueDelivery(orderId);
  await awardPointsForOrder(orderId).catch((e) => console.error('[loyalty] Attribution des points impossible', orderId, e));
  return deliveryId;
}

/**
 * Marque la commande payée — IDEMPOTENT et sûr en concurrence : la transition pending→paid (paidAt) n'a lieu
 * qu'une fois (UPDATE … WHERE status IN ('pending','failed')). Un paiement confirmé par Stripe après un échec
 * technique ou une expiration (failed) est honoré : l'argent a été encaissé, le joueur doit recevoir son achat.
 * Une commande remboursée/contestée n'est jamais relivrée.
 * Les suites (reçu, enqueueDelivery, points) sont rejouées à chaque fois que la commande est payée (chacune
 * idempotente), ce qui rattrape une étape non faite si un appel précédent a échoué juste après la transition.
 * Réservé aux confirmations Stripe vérifiées : la simulation passe par payMockOrder (pending uniquement).
 */
export async function markOrderPaid(orderId: string, opts: { paymentIntentId?: string | null } = {}): Promise<MarkOrderPaidResult> {
  const pi = opts.paymentIntentId || null;
  const [updated] = await db
    .update(orders)
    .set({ status: 'paid', paidAt: new Date(), ...(pi ? { stripePaymentIntentId: pi } : {}) })
    .where(and(eq(orders.id, orderId), inArray(orders.status, ['pending', 'failed'])))
    .returning({ id: orders.id });

  if (updated) {
    const deliveryId = await afterOrderPaid(orderId);
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
  const deliveryId = await afterOrderPaid(orderId);
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
// Remboursements et litiges
// ---------------------------------------------------------------------------------------------

export interface MarkOrderRefundedResult {
  orderId: string;
  transitioned: boolean;
  previousStatus: OrderStatus | null;
  refundQueued: boolean;
}

/**
 * Suites d'un remboursement d'une commande payée : reprise des points Dev AppStore (ne lève jamais) puis révocation
 * `purchase.refunded` côté jeu (enqueueRefund, delivery.ts). Les deux sont idempotentes. Renvoie true si un
 * événement de révocation existe pour la commande.
 */
async function afterOrderRefunded(orderId: string): Promise<boolean> {
  await revokePointsForOrder(orderId, { note: 'remboursement' }).catch((e) => console.error('[loyalty] Reprise des points impossible', orderId, e));
  return (await delivery.enqueueRefund(orderId)) !== null;
}

/**
 * Commande remboursée ou contestée → `refunded` (idempotent). Si elle était payée (livraison possible), les points
 * sont repris et enqueueRefund(orderId) révoque l'achat dans le jeu. Une commande encore pending/failed passe
 * aussi à `refunded` : un événement de paiement arrivé après ne la livrera pas.
 */
export async function markOrderRefunded(orderId: string): Promise<MarkOrderRefundedResult> {
  const now = new Date();
  const [wasPaid] = await db
    .update(orders)
    .set({ status: 'refunded', refundedAt: now })
    .where(and(eq(orders.id, orderId), eq(orders.status, 'paid')))
    .returning({ id: orders.id });
  if (wasPaid) {
    const refundQueued = await afterOrderRefunded(orderId);
    return { orderId, transitioned: true, previousStatus: 'paid', refundQueued };
  }
  const [notPaid] = await db
    .update(orders)
    .set({ status: 'refunded', refundedAt: now })
    .where(and(eq(orders.id, orderId), inArray(orders.status, ['pending', 'failed'])))
    .returning({ id: orders.id });
  if (notPaid) return { orderId, transitioned: true, previousStatus: null, refundQueued: false };
  const [existing] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
  return { orderId, transitioned: false, previousStatus: existing?.status ?? null, refundQueued: false };
}

const refId = (x: string | { id: string } | null | undefined) => (typeof x === 'string' ? x : (x?.id ?? null));

async function findOrderIdByPayment(paymentIntentId: string | null, metadataOrderId?: string | null): Promise<string | null> {
  if (paymentIntentId) {
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.stripePaymentIntentId, paymentIntentId));
    if (o) return o.id;
  }
  if (metadataOrderId) {
    const [o] = await db.select({ id: orders.id, pi: orders.stripePaymentIntentId }).from(orders).where(eq(orders.id, metadataOrderId));
    // La métadonnée ne suffit pas si la commande est rattachée à un autre paiement.
    if (o && (!o.pi || o.pi === paymentIntentId)) return o.id;
  }
  return null;
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

/**
 * Bouton « Payer » de /checkout/mock. Transition conditionnelle unique : commande de CET utilisateur, `pending`
 * et non expirée → `paid`. Une commande payée, échouée, remboursée, expirée ou d'un autre utilisateur est refusée
 * (pas de « failed → paid » en simulation).
 */
export async function payMockOrder(userId: string, orderId: string): Promise<MarkOrderPaidResult> {
  assertSimulationAllowed();
  const cutoff = new Date(Date.now() - PENDING_ORDER_TTL_MS);
  const [updated] = await db
    .update(orders)
    .set({ status: 'paid', paidAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId), eq(orders.status, 'pending'), gt(orders.createdAt, cutoff)))
    .returning({ id: orders.id });
  if (updated) {
    const deliveryId = await afterOrderPaid(orderId);
    return { orderId, transitioned: true, status: 'paid', deliveryId };
  }
  const [order] = await db.select({ status: orders.status }).from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
  if (!order) throw new SimulationError('order_not_found', 'Commande introuvable.');
  if (order.status === 'pending') await markOrderFailed(orderId); // expirée
  throw new SimulationError('order_not_payable', 'Cette commande ne peut plus être payée.');
}

// ---------------------------------------------------------------------------------------------
// Webhook Stripe
// ---------------------------------------------------------------------------------------------

export interface StripeEventResult {
  handled: boolean;
  detail: string;
  /** Anomalie à vérifier par un humain (journalisée en erreur et conservée dans stripe_events.alert). */
  alert?: string;
  orderId?: string;
  /** Événement déjà traité (même event.id). */
  duplicate?: boolean;
}

/**
 * Applique une session Checkout (webhook ou resynchronisation au retour sur /checkout/success).
 * Contrôles : commande retrouvée par l'id de session (repli sur la métadonnée seulement si la commande n'a pas encore
 * de session), montant et devise identiques à la commande, paiement réellement reçu. Sinon : alerte, pas de livraison.
 */
export async function applyCheckoutSession(session: Stripe.Checkout.Session): Promise<StripeEventResult> {
  let [order] = await db.select().from(orders).where(eq(orders.stripeCheckoutSessionId, session.id));
  if (!order) {
    const orderId = session.metadata?.order_id || session.client_reference_id;
    if (!orderId) return { handled: false, detail: 'session sans order_id (pas une commande Dev AppStore)' };
    [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) return { handled: false, detail: `commande inconnue ${orderId}` };
    if (order.stripeCheckoutSessionId && order.stripeCheckoutSessionId !== session.id) {
      return { handled: false, orderId: order.id, detail: 'session différente de celle de la commande', alert: `session ${session.id} inattendue pour la commande ${order.id}` };
    }
    if (session.client_reference_id && session.client_reference_id !== order.id) {
      return { handled: false, orderId: order.id, detail: 'client_reference_id incohérent', alert: `client_reference_id ${session.client_reference_id} ≠ ${order.id}` };
    }
  }
  const orderId = order.id;
  const subtotal = session.amount_subtotal ?? session.amount_total;
  const discount = session.total_details?.amount_discount ?? 0;
  const currencyOk = session.currency?.toLowerCase() === order.currency.toLowerCase();
  if (session.amount_total !== order.amountCents || subtotal !== order.amountCents || discount !== 0 || !currencyOk) {
    return {
      handled: false,
      orderId,
      detail: 'montant ou devise incohérents',
      alert: `montant/devise incohérents pour ${orderId} : attendu ${order.amountCents} ${order.currency}, reçu ${session.amount_total} ${session.currency} — commande NON payée, aucune livraison`,
    };
  }
  if (session.payment_status !== 'paid') return { handled: false, orderId, detail: `paiement non finalisé (${session.payment_status})` };
  if (!order.stripeCheckoutSessionId) {
    await db.update(orders).set({ stripeCheckoutSessionId: session.id }).where(and(eq(orders.id, orderId), isNull(orders.stripeCheckoutSessionId)));
  }
  const r = await markOrderPaid(orderId, { paymentIntentId: refId(session.payment_intent) });
  return { handled: true, orderId, detail: r.transitioned ? 'commande payée' : `déjà traitée (${r.status})` };
}

/** Traite un événement Stripe dont la signature a été vérifiée. Lève une erreur → la route répond 500 (Stripe réessaie). */
export async function handleStripeEvent(event: Stripe.Event): Promise<StripeEventResult> {
  if (event.livemode === false && !acceptsTestModeEvents()) {
    return { handled: false, detail: 'événement du mode test ignoré en production', alert: `événement de test ${event.type} reçu en production` };
  }
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
      return { handled: true, orderId, detail: changed ? 'commande échouée' : 'aucun changement' };
    }

    case 'charge.refunded': {
      const charge = event.data.object;
      const orderId = await findOrderIdByPayment(refId(charge.payment_intent), charge.metadata?.order_id);
      if (!orderId) return { handled: false, detail: 'remboursement d’un paiement inconnu', alert: `charge.refunded ${charge.id} sans commande Dev AppStore` };
      if (!charge.refunded) {
        return {
          handled: false,
          orderId,
          detail: 'remboursement partiel',
          alert: `remboursement partiel (${charge.amount_refunded}/${charge.amount}) pour ${orderId} : statut inchangé, à traiter manuellement`,
        };
      }
      const r = await markOrderRefunded(orderId);
      return { handled: true, orderId, detail: r.transitioned ? `commande remboursée${r.refundQueued ? ', révocation demandée' : ''}` : 'déjà remboursée' };
    }

    case 'charge.dispute.created': {
      const dispute = event.data.object;
      const orderId = await findOrderIdByPayment(refId(dispute.payment_intent), dispute.metadata?.order_id);
      if (!orderId) return { handled: false, detail: 'litige sur un paiement inconnu', alert: `litige ${dispute.id} sans commande Dev AppStore` };
      const r = await markOrderRefunded(orderId);
      return {
        handled: true,
        orderId,
        detail: r.transitioned ? `litige : commande passée à refunded${r.refundQueued ? ', révocation demandée' : ''}` : 'déjà remboursée',
        alert: `litige ${dispute.id} (${dispute.reason}) sur ${orderId} : préparer les preuves de livraison`,
      };
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
 * Point d'entrée du webhook : idempotence par `event.id` (table stripe_events) puis handleStripeEvent.
 * - événement déjà traité avec succès → renvoyé comme doublon, sans effet ;
 * - événement reçu mais dont le traitement a échoué (ou est en cours) → retraité : les transitions sont
 *   conditionnelles, un double traitement concurrent ne livre pas deux fois ;
 * - une erreur laisse processedAt vide pour que le rejeu de Stripe soit traité.
 */
export async function processStripeEvent(event: Stripe.Event): Promise<StripeEventResult> {
  const inserted = await db.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning({ id: stripeEvents.id });
  if (inserted.length === 0) {
    const [row] = await db.select({ processedAt: stripeEvents.processedAt, orderId: stripeEvents.orderId }).from(stripeEvents).where(eq(stripeEvents.id, event.id));
    if (row?.processedAt) return { handled: true, duplicate: true, orderId: row.orderId ?? undefined, detail: 'événement déjà traité' };
  }
  const result = await handleStripeEvent(event);
  if (result.alert) console.error(`[payments][ALERTE] ${event.type} ${event.id} : ${result.alert}`);
  await db
    .update(stripeEvents)
    .set({ processedAt: new Date(), orderId: result.orderId ?? null, detail: result.detail.slice(0, 500), alert: result.alert?.slice(0, 1000) ?? null })
    .where(eq(stripeEvents.id, event.id));
  return result;
}

/**
 * Au retour sur /checkout/success, si le webhook n'est pas encore arrivé (ou n'est pas configuré en local),
 * interroge Stripe directement (appel authentifié par la clé secrète) et applique la session (mêmes contrôles).
 */
export async function syncOrderWithStripe(orderId: string): Promise<void> {
  if (!isStripeEnabled() || paymentsConfigProblem()) return;
  const [row] = await db
    .select({ order: orders, studio: { stripeAccountId: studios.stripeAccountId, stripeChargesEnabled: studios.stripeChargesEnabled } })
    .from(orders)
    .innerJoin(games, eq(games.id, orders.gameId))
    .innerJoin(studios, eq(studios.id, games.studioId))
    .where(eq(orders.id, orderId));
  const order = row?.order;
  if (!row || !order || order.status !== 'pending' || !order.stripeCheckoutSessionId) return;
  try {
    const opts = checkoutRequestOptions(order.id, row.studio);
    const session = await getStripe().checkout.sessions.retrieve(
      order.stripeCheckoutSessionId,
      {},
      opts.stripeAccount ? { stripeAccount: opts.stripeAccount } : {},
    );
    if (session.status === 'expired') await markOrderFailed(orderId);
    else {
      const r = await applyCheckoutSession(session);
      if (r.alert) console.error(`[payments][ALERTE] resynchronisation ${orderId} : ${r.alert}`);
    }
  } catch (e) {
    console.error('[payments] Resynchronisation Stripe impossible', orderId, e instanceof Error ? e.message : 'erreur inconnue');
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
  const [deliveryRow, link] = await Promise.all([
    db.query.deliveries.findFirst({ where: (t, { eq }) => eq(t.orderId, orderId) }),
    getGameLink(userId, row.order.gameId),
  ]);
  const playerName = link && link.playerId === row.order.playerId ? link.playerName : null;
  return { ...row, delivery: deliveryRow ?? null, playerName };
}

export type OrderView = NonNullable<Awaited<ReturnType<typeof getOrderForUser>>>;
