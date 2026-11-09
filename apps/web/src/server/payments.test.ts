import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { DEFAULT_PLATFORM_FEE_BPS } from '@wolleen/core';
import { db, eq, items, orders, studios } from '@wolleen/db';
import { clearPendingOrders, FX, getOrder, insertPendingOrder, seedPaymentsFixtures } from '@/test/payments-fixtures';
import {
  applyCheckoutSession,
  buildCheckoutSessionParams,
  CHECKOUT_SESSION_TTL_S,
  CheckoutError,
  checkoutRequestOptions,
  computePlatformFee,
  createCheckout,
  expireStalePendingOrders,
  handleStripeEvent,
  markOrderPaid,
  markOrderRefunded,
  payMockOrder,
  PENDING_ORDER_TTL_MS,
  platformFeeBps,
  SimulationError,
  truncateIp,
} from './payments';

// Base en mémoire à la place de .data/pglite.
vi.mock('@wolleen/db', async (importOriginal) => {
  const { createTestDb } = await import('@wolleen/db/testing');
  (globalThis as { __wolleenDb?: unknown }).__wolleenDb = await createTestDb();
  return importOriginal();
});

// Contrat delivery : on vérifie l'appel, pas l'envoi au jeu (testé par la tâche « delivery »).
const delivery = vi.hoisted(() => ({
  enqueueDelivery: vi.fn(async (orderId: string) => `dlv_${orderId}`),
  // Révocation purchase.refunded (delivery.ts), importée directement par payments.
  enqueueRefund: vi.fn(async (orderId: string) => `rfd_${orderId}`),
}));
vi.mock('@/server/delivery', () => delivery);

// Faux client Stripe (aucun appel réseau).
const fakeStripe = vi.hoisted(() => ({
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
}));
vi.mock('@/server/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./stripe')>()),
  getStripe: () => fakeStripe,
}));

const ORIGIN = 'https://wolleen.test';
const CONSENT = { withdrawalWaiver: true, ip: '203.0.113.77' };

beforeAll(async () => {
  await seedPaymentsFixtures();
});

beforeEach(async () => {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('PLATFORM_FEE_BPS', '');
  vi.stubEnv('CHARGE_MODEL', '');
  vi.stubEnv('STRIPE_AUTOMATIC_TAX', '');
  vi.stubEnv('WOLLEEN_ALLOW_TEST_PAYMENTS', '');
  delivery.enqueueDelivery.mockClear();
  delivery.enqueueRefund.mockClear();
  fakeStripe.checkout.sessions.create.mockReset();
  await clearPendingOrders();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function ordersOf(userId: string) {
  return db.select().from(orders).where(eq(orders.userId, userId));
}

async function expectCheckoutError(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(CheckoutError);
  expect((err as CheckoutError).code).toBe(code);
  return err as CheckoutError;
}

describe('commission plateforme', () => {
  it('lit PLATFORM_FEE_BPS, sinon la valeur par défaut', () => {
    expect(platformFeeBps(undefined)).toBe(DEFAULT_PLATFORM_FEE_BPS);
    expect(platformFeeBps('')).toBe(DEFAULT_PLATFORM_FEE_BPS);
    expect(platformFeeBps('250')).toBe(250);
    expect(platformFeeBps('0')).toBe(0);
    expect(platformFeeBps(' 1000 ')).toBe(1000);
    expect(platformFeeBps('3000')).toBe(3000);
    for (const bad of ['abc', '-5', '12.5', '10001', '3001', '1e3', '0x10']) expect(platformFeeBps(bad)).toBe(DEFAULT_PLATFORM_FEE_BPS);
  });

  it('calcule la commission en centimes (arrondi au centime)', () => {
    expect(computePlatformFee(799, 500)).toBe(40); // 39,95 → 40
    expect(computePlatformFee(999, 250)).toBe(25); // 24,975 → 25
    expect(computePlatformFee(3999, 500)).toBe(200); // 199,95 → 200
    expect(computePlatformFee(1000, 0)).toBe(0);
  });

  it('fige la commission de PLATFORM_FEE_BPS dans la commande', async () => {
    vi.stubEnv('PLATFORM_FEE_BPS', '1000');
    const r = await createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN, consent: CONSENT });
    expect((await getOrder(r.orderId))?.platformFeeCents).toBe(80);
  });
});

describe('createCheckout — mode simulation', () => {
  it('crée une commande pending figée et renvoie /checkout/mock', async () => {
    const r = await createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN, consent: CONSENT });
    expect(r.mode).toBe('simulation');
    expect(r.url).toBe(`/checkout/mock?order=${r.orderId}`);
    const o = await getOrder(r.orderId);
    expect(o).toMatchObject({
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
      paidAt: null,
    });
    expect(fakeStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("garde la copie figée si l'article change ensuite", async () => {
    const r = await createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN, consent: CONSENT });
    await db.update(items).set({ priceCents: 1299, title: 'Renommé' }).where(eq(items.id, FX.item));
    try {
      expect(await getOrder(r.orderId)).toMatchObject({ amountCents: 799, itemTitle: 'Sac de gemmes' });
    } finally {
      await db.update(items).set({ priceCents: 799, title: 'Sac de gemmes' }).where(eq(items.id, FX.item));
    }
  });

  it("refuse si le compte de jeu n'est pas lié (→ page de liaison), sans créer de commande", async () => {
    const err = await expectCheckoutError(createCheckout({ user: FX.stranger, itemId: FX.item, origin: ORIGIN, consent: CONSENT }), 'not_linked');
    expect(err.status).toBe(409);
    expect(err.redirect).toBe(`/games/${FX.game.slug}/link?item=${FX.item}`);
    expect(await ordersOf(FX.stranger.id)).toHaveLength(0);
  });

  it('refuse un article inactif, inconnu, ou d’un jeu non publié', async () => {
    const before = (await ordersOf(FX.buyer.id)).length;
    for (const itemId of [FX.inactiveItem, FX.draftItem, 'itm_inconnu']) {
      const err = await expectCheckoutError(createCheckout({ user: FX.buyer, itemId, origin: ORIGIN, consent: CONSENT }), 'item_unavailable');
      expect(err.status).toBe(404);
    }
    expect(await ordersOf(FX.buyer.id)).toHaveLength(before);
  });

  it('refuse un prix sous le minimum Stripe', async () => {
    await expectCheckoutError(createCheckout({ user: FX.buyer, itemId: FX.cheapItem, origin: ORIGIN, consent: CONSENT }), 'amount_too_low');
  });

  it('mode simulation interdit en production (NODE_ENV=production sans clé → erreur, aucune commande)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const before = (await ordersOf(FX.buyer.id)).length;
    const err = await expectCheckoutError(createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN, consent: CONSENT }), 'payments_unavailable');
    expect(err.status).toBe(503);
    expect(await ordersOf(FX.buyer.id)).toHaveLength(before);
  });
});

describe('createCheckout — Stripe', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
  });

  it('crée une session Checkout et enregistre son id', async () => {
    fakeStripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    const r = await createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN, consent: CONSENT });
    expect(r).toMatchObject({ mode: 'stripe', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    const [params, opts] = fakeStripe.checkout.sessions.create.mock.calls[0]!;
    expect(params).toMatchObject({
      mode: 'payment',
      client_reference_id: r.orderId,
      metadata: { order_id: r.orderId },
      success_url: `${ORIGIN}/checkout/success?order=${r.orderId}`,
      cancel_url: `${ORIGIN}/games/${FX.game.slug}?item=${FX.item}`,
      customer_email: FX.buyer.email,
    });
    expect(params.line_items[0].price_data).toMatchObject({ currency: 'eur', unit_amount: 799 });
    // Studio sans compte Connect → encaissement sur le compte plateforme.
    expect(params.payment_intent_data.transfer_data).toBeUndefined();
    expect(params.payment_intent_data.application_fee_amount).toBeUndefined();
    expect(opts).toEqual({ idempotencyKey: `wolleen_checkout_${r.orderId}` });
    expect(await getOrder(r.orderId)).toMatchObject({ status: 'pending', stripeCheckoutSessionId: 'cs_test_1' });
  });

  it('marque la commande failed si Stripe échoue', async () => {
    fakeStripe.checkout.sessions.create.mockRejectedValue(new Error('réseau'));
    const err = await expectCheckoutError(createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN, consent: CONSENT }), 'payment_provider_error');
    expect(err.status).toBe(502);
    const all = await ordersOf(FX.buyer.id);
    expect(all.sort((a, b) => +b.createdAt - +a.createdAt)[0]?.status).toBe('failed');
  });

  it('paiement destination Connect quand le studio a activé les paiements', () => {
    const order = {
      id: 'ord_x', itemTitle: 'Gemmes', productId: 'gems', playerId: 'P1', amountCents: 799, platformFeeCents: 40,
      currency: 'EUR' as const, gameId: 'gam_x', itemId: 'itm_x',
    };
    const game = { name: 'Jeu', slug: 'jeu' };
    const connect = buildCheckoutSessionParams({ order, game, studio: { stripeAccountId: 'acct_1', stripeChargesEnabled: true }, origin: ORIGIN });
    expect(connect.payment_intent_data).toMatchObject({ application_fee_amount: 40, transfer_data: { destination: 'acct_1' }, metadata: { order_id: 'ord_x' } });

    const notReady = buildCheckoutSessionParams({ order, game, studio: { stripeAccountId: 'acct_1', stripeChargesEnabled: false }, origin: ORIGIN });
    expect(notReady.payment_intent_data?.transfer_data).toBeUndefined();
    expect(notReady.payment_intent_data?.application_fee_amount).toBeUndefined();
  });
});

describe('markOrderPaid', () => {
  it('est idempotent : pending→paid une seule fois, paidAt inchangé ensuite', async () => {
    const o = await insertPendingOrder();
    const first = await markOrderPaid(o.id, { paymentIntentId: 'pi_1' });
    expect(first).toMatchObject({ transitioned: true, status: 'paid', deliveryId: `dlv_${o.id}` });
    const paid = await getOrder(o.id);
    expect(paid?.status).toBe('paid');
    expect(paid?.paidAt).toBeInstanceOf(Date);
    expect(paid?.stripePaymentIntentId).toBe('pi_1');

    const second = await markOrderPaid(o.id, { paymentIntentId: 'pi_autre' });
    expect(second).toMatchObject({ transitioned: false, status: 'paid' });
    const again = await getOrder(o.id);
    expect(again?.paidAt?.getTime()).toBe(paid?.paidAt?.getTime());
    expect(again?.stripePaymentIntentId).toBe('pi_1');
    // enqueueDelivery (lui-même idempotent) est toujours appelé avec la commande : rattrape une livraison manquante.
    expect(delivery.enqueueDelivery).toHaveBeenCalledWith(o.id);
    expect(delivery.enqueueDelivery.mock.calls.every(([id]) => id === o.id)).toBe(true);
  });

  it('une seule transition sous appels concurrents (webhook rejoué + retour utilisateur)', async () => {
    const o = await insertPendingOrder();
    const results = await Promise.all(Array.from({ length: 5 }, () => markOrderPaid(o.id)));
    expect(results.filter((r) => r.transitioned)).toHaveLength(1);
    expect(results.every((r) => r.status === 'paid')).toBe(true);
  });

  it('ne relivre pas une commande remboursée', async () => {
    const o = await insertPendingOrder({ status: 'refunded' });
    const r = await markOrderPaid(o.id);
    expect(r).toMatchObject({ transitioned: false, status: 'refunded', deliveryId: null });
    expect(delivery.enqueueDelivery).not.toHaveBeenCalled();
  });

  it('honore un paiement confirmé après un échec technique (failed → paid)', async () => {
    const o = await insertPendingOrder({ status: 'failed' });
    expect((await markOrderPaid(o.id)).transitioned).toBe(true);
  });

  it('lève une erreur pour une commande inconnue', async () => {
    await expect(markOrderPaid('ord_inconnue')).rejects.toThrow(/inconnue/);
  });
});

describe('payMockOrder (bouton Payer de la simulation)', () => {
  it('paie la commande en simulation', async () => {
    const o = await insertPendingOrder();
    expect((await payMockOrder(FX.buyer.id, o.id)).transitioned).toBe(true);
    expect((await getOrder(o.id))?.status).toBe('paid');
  });

  it('interdit en production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const o = await insertPendingOrder();
    await expect(payMockOrder(FX.buyer.id, o.id)).rejects.toMatchObject({ code: 'simulation_forbidden' });
    expect((await getOrder(o.id))?.status).toBe('pending');
  });

  it('interdit quand Stripe est configuré (sinon paiement gratuit)', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
    const o = await insertPendingOrder();
    await expect(payMockOrder(FX.buyer.id, o.id)).rejects.toBeInstanceOf(SimulationError);
    expect((await getOrder(o.id))?.status).toBe('pending');
  });

  it("refuse la commande d'un autre utilisateur", async () => {
    const o = await insertPendingOrder();
    await expect(payMockOrder(FX.stranger.id, o.id)).rejects.toMatchObject({ code: 'order_not_found' });
  });
});

describe('événements Stripe', () => {
  const session = (o: { id: string; stripeCheckoutSessionId?: string | null }, extra: Partial<Stripe.Checkout.Session> = {}) =>
    ({
      id: o.stripeCheckoutSessionId ?? 'cs_x',
      object: 'checkout.session',
      metadata: { order_id: o.id },
      client_reference_id: o.id,
      amount_subtotal: 799,
      amount_total: 799,
      currency: 'eur',
      payment_status: 'paid',
      payment_intent: 'pi_evt',
      status: 'complete',
      ...extra,
    }) as Stripe.Checkout.Session;
  const event = (type: string, object: unknown) => ({ id: `evt_${type}`, type, data: { object } }) as unknown as Stripe.Event;

  it('checkout.session.completed → commande payée', async () => {
    const o = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_ok' });
    const r = await handleStripeEvent(event('checkout.session.completed', session(o)));
    expect(r.handled).toBe(true);
    expect(await getOrder(o.id)).toMatchObject({ status: 'paid', stripePaymentIntentId: 'pi_evt' });
    expect(delivery.enqueueDelivery).toHaveBeenCalledWith(o.id);
  });

  it('refuse un montant ou une session incohérents', async () => {
    const o = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_amount' });
    expect((await applyCheckoutSession(session(o, { amount_subtotal: 1, amount_total: 1 }))).handled).toBe(false);
    expect((await applyCheckoutSession(session(o, { currency: 'usd' }))).handled).toBe(false);
    expect((await applyCheckoutSession(session(o, { id: 'cs_autre' }))).handled).toBe(false);
    expect((await getOrder(o.id))?.status).toBe('pending');
  });

  it('paiement différé : attend async_payment_succeeded', async () => {
    const o = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_async' });
    await handleStripeEvent(event('checkout.session.completed', session(o, { payment_status: 'unpaid' })));
    expect((await getOrder(o.id))?.status).toBe('pending');
    await handleStripeEvent(event('checkout.session.async_payment_succeeded', session(o)));
    expect((await getOrder(o.id))?.status).toBe('paid');
  });

  it('session expirée → commande failed (jamais une commande payée)', async () => {
    const o = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_exp' });
    await handleStripeEvent(event('checkout.session.expired', session(o, { status: 'expired', payment_status: 'unpaid' })));
    expect((await getOrder(o.id))?.status).toBe('failed');

    const paid = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_exp_paid', status: 'paid' });
    await handleStripeEvent(event('checkout.session.expired', session(paid)));
    expect((await getOrder(paid.id))?.status).toBe('paid');
  });

  it('account.updated → stripeChargesEnabled du studio', async () => {
    await db.update(studios).set({ stripeAccountId: 'acct_test' }).where(eq(studios.id, FX.studio));
    await handleStripeEvent(event('account.updated', { id: 'acct_test', object: 'account', charges_enabled: true }));
    expect((await db.select().from(studios).where(eq(studios.id, FX.studio)))[0]?.stripeChargesEnabled).toBe(true);
    await handleStripeEvent(event('account.updated', { id: 'acct_test', object: 'account', charges_enabled: false }));
    expect((await db.select().from(studios).where(eq(studios.id, FX.studio)))[0]?.stripeChargesEnabled).toBe(false);
    await db.update(studios).set({ stripeAccountId: null }).where(eq(studios.id, FX.studio));
  });

  it('ignore les événements non gérés', async () => {
    expect((await handleStripeEvent(event('customer.created', { id: 'cus_1' }))).handled).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Non-régression sécurité (revue vague 2)
// ---------------------------------------------------------------------------------------------

describe('sécurité — consentement et conditions d’achat', () => {
  it('consentement absent → consent_required, aucune commande', async () => {
    const before = (await ordersOf(FX.buyer.id)).length;
    await expectCheckoutError(
      createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN, consent: { withdrawalWaiver: false } }),
      'consent_required',
    );
    expect(await ordersOf(FX.buyer.id)).toHaveLength(before);
  });

  it('production + Stripe : studio sans compte Connect actif → seller_not_ready (CHK-PAY-02)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_fake');
    await expectCheckoutError(createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN, consent: CONSENT }), 'seller_not_ready');
    expect(fakeStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('production : clé sk_test_ refusée (payments_unavailable) sauf WOLLEEN_ALLOW_TEST_PAYMENTS=1 (CHK-PAY-10)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
    const err = await expectCheckoutError(createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN, consent: CONSENT }), 'payments_unavailable');
    expect(err.status).toBe(503);
    vi.stubEnv('WOLLEEN_ALLOW_TEST_PAYMENTS', '1');
    await expectCheckoutError(createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN, consent: CONSENT }), 'seller_not_ready');
  });

  it('CHARGE_MODEL=direct : compte Connect requis, session créée sur le compte du studio', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
    vi.stubEnv('CHARGE_MODEL', 'direct');
    await expectCheckoutError(createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN, consent: CONSENT }), 'seller_not_ready');

    await db.update(studios).set({ stripeAccountId: 'acct_direct', stripeChargesEnabled: true }).where(eq(studios.id, FX.studio));
    try {
      fakeStripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_direct', url: 'https://checkout.stripe.com/c/pay/cs_direct' });
      const r = await createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN, consent: CONSENT });
      const [params, opts] = fakeStripe.checkout.sessions.create.mock.calls[0]!;
      expect(opts).toEqual({ idempotencyKey: `wolleen_checkout_${r.orderId}`, stripeAccount: 'acct_direct' });
      expect(params.payment_intent_data.application_fee_amount).toBe(40);
      expect(params.payment_intent_data.transfer_data).toBeUndefined();
      expect(params.automatic_tax).toEqual({ enabled: false });
      expect(params.metadata).toMatchObject({ charge_model: 'direct', link_method: 'code', link_verified: '1', terms_version: expect.any(String) });
    } finally {
      await db.update(studios).set({ stripeAccountId: null, stripeChargesEnabled: false }).where(eq(studios.id, FX.studio));
    }
  });

  it('limite le nombre de commandes pending par utilisateur (anti-spam)', async () => {
    for (let i = 0; i < 5; i++) await createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN, consent: CONSENT });
    const err = await expectCheckoutError(createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN, consent: CONSENT }), 'too_many_pending');
    expect(err.status).toBe(429);
    // Les commandes pending de plus de 24 h ne comptent plus (elles sont expirées au passage).
    await db.update(orders).set({ createdAt: new Date(Date.now() - PENDING_ORDER_TTL_MS - 60_000) }).where(eq(orders.userId, FX.buyer.id));
    const r = await createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN, consent: CONSENT });
    expect((await getOrder(r.orderId))?.status).toBe('pending');
  });

  it('le prix de la commande vient de la base, même si l’article change entre l’affichage et le paiement', async () => {
    await db.update(items).set({ priceCents: 1299 }).where(eq(items.id, FX.item));
    try {
      const r = await createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN, consent: CONSENT });
      expect((await getOrder(r.orderId))?.amountCents).toBe(1299);
    } finally {
      await db.update(items).set({ priceCents: 799 }).where(eq(items.id, FX.item));
    }
  });
});

describe('sécurité — expiration des commandes pending', () => {
  it('passe à failed les pending de plus de 24 h, ne touche ni les récentes ni les payées', async () => {
    const old = new Date(Date.now() - PENDING_ORDER_TTL_MS - 60_000);
    const stale = await insertPendingOrder({ createdAt: old });
    const fresh = await insertPendingOrder();
    const paidOld = await insertPendingOrder({ createdAt: old, status: 'paid', paidAt: old });
    expect(await expireStalePendingOrders()).toBeGreaterThanOrEqual(1);
    expect((await getOrder(stale.id))?.status).toBe('failed');
    expect((await getOrder(fresh.id))?.status).toBe('pending');
    expect((await getOrder(paidOld.id))?.status).toBe('paid');
  });
});

describe('sécurité — paiement simulé (CHK-PAY-11)', () => {
  it('refuse une commande déjà payée (pas de nouvelle livraison)', async () => {
    const o = await insertPendingOrder({ status: 'paid', paidAt: new Date() });
    await expect(payMockOrder(FX.buyer.id, o.id)).rejects.toMatchObject({ code: 'order_not_payable' });
    expect(delivery.enqueueDelivery).not.toHaveBeenCalled();
  });

  it('refuse une commande échouée ou remboursée (pas de failed → paid en simulation)', async () => {
    for (const status of ['failed', 'refunded'] as const) {
      const o = await insertPendingOrder({ status });
      await expect(payMockOrder(FX.buyer.id, o.id)).rejects.toMatchObject({ code: 'order_not_payable' });
      expect((await getOrder(o.id))?.status).toBe(status);
    }
    expect(delivery.enqueueDelivery).not.toHaveBeenCalled();
  });

  it('refuse une commande pending expirée (> 24 h) et la passe à failed', async () => {
    const o = await insertPendingOrder({ createdAt: new Date(Date.now() - PENDING_ORDER_TTL_MS - 60_000) });
    await expect(payMockOrder(FX.buyer.id, o.id)).rejects.toMatchObject({ code: 'order_not_payable' });
    expect((await getOrder(o.id))?.status).toBe('failed');
  });

  it("commande d'un autre utilisateur : refus, statut inchangé, aucune livraison", async () => {
    const o = await insertPendingOrder();
    await expect(payMockOrder(FX.stranger.id, o.id)).rejects.toMatchObject({ code: 'order_not_found' });
    expect((await getOrder(o.id))?.status).toBe('pending');
    expect(delivery.enqueueDelivery).not.toHaveBeenCalled();
  });

  it('double clic concurrent : une seule transition', async () => {
    const o = await insertPendingOrder();
    const results = await Promise.allSettled([payMockOrder(FX.buyer.id, o.id), payMockOrder(FX.buyer.id, o.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(delivery.enqueueDelivery).toHaveBeenCalledTimes(1);
  });
});

describe('sécurité — session Checkout (CHK-PAY-08)', () => {
  const session = (id: string, orderId: string, extra: Partial<Stripe.Checkout.Session> = {}) =>
    ({
      id,
      object: 'checkout.session',
      metadata: { order_id: orderId },
      client_reference_id: orderId,
      amount_subtotal: 799,
      amount_total: 799,
      currency: 'eur',
      payment_status: 'paid',
      payment_intent: 'pi_sec',
      status: 'complete',
      ...extra,
    }) as Stripe.Checkout.Session;

  it('la commande est retrouvée par l’id de session : une métadonnée pointant ailleurs est ignorée', async () => {
    const a = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_sec_a' });
    const b = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_sec_b' });
    const r = await applyCheckoutSession(session('cs_sec_a', b.id));
    expect(r).toMatchObject({ handled: true, orderId: a.id });
    expect((await getOrder(a.id))?.status).toBe('paid');
    expect((await getOrder(b.id))?.status).toBe('pending');
  });

  it('remise appliquée ou total différent du sous-total → refus avec alerte', async () => {
    const o = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_sec_disc' });
    const disc = await applyCheckoutSession(
      session('cs_sec_disc', o.id, { amount_total: 1, total_details: { amount_discount: 798, amount_shipping: 0, amount_tax: 0 } }),
    );
    expect(disc.handled).toBe(false);
    expect(disc.alert).toMatch(/incohérents/);
    expect((await applyCheckoutSession(session('cs_sec_disc', o.id, { amount_subtotal: 799, amount_total: 900 }))).handled).toBe(false);
    expect((await getOrder(o.id))?.status).toBe('pending');
    expect(delivery.enqueueDelivery).not.toHaveBeenCalled();
  });
});

describe('sécurité — remboursements et litiges', () => {
  let seq = 0;
  const event = (type: string, object: unknown, livemode = true) => ({ id: `evt_${type}_${++seq}`, type, livemode, data: { object } }) as unknown as Stripe.Event;

  it('charge.refunded (total) → refunded + enqueueRefund, une seule fois', async () => {
    const o = await insertPendingOrder({ status: 'paid', paidAt: new Date(), stripePaymentIntentId: 'pi_rf_1' });
    const charge = { id: 'ch_rf_1', object: 'charge', payment_intent: 'pi_rf_1', refunded: true, amount: 799, amount_refunded: 799, metadata: {} };
    const r = await handleStripeEvent(event('charge.refunded', charge));
    expect(r).toMatchObject({ handled: true, orderId: o.id });
    const refunded = await getOrder(o.id);
    expect(refunded?.status).toBe('refunded');
    expect(refunded?.refundedAt).toBeInstanceOf(Date);
    expect(delivery.enqueueRefund).toHaveBeenCalledWith(o.id);
    await handleStripeEvent(event('charge.refunded', charge));
    expect(delivery.enqueueRefund).toHaveBeenCalledTimes(1);
  });

  it('remboursement partiel → statut inchangé, alerte', async () => {
    const o = await insertPendingOrder({ status: 'paid', paidAt: new Date(), stripePaymentIntentId: 'pi_rf_part' });
    const r = await handleStripeEvent(
      event('charge.refunded', { id: 'ch_p', object: 'charge', payment_intent: 'pi_rf_part', refunded: false, amount: 799, amount_refunded: 100, metadata: {} }),
    );
    expect(r.handled).toBe(false);
    expect(r.alert).toMatch(/partiel/);
    expect((await getOrder(o.id))?.status).toBe('paid');
    expect(delivery.enqueueRefund).not.toHaveBeenCalled();
  });

  it('charge.dispute.created → refunded + enqueueRefund ; un paiement confirmé ensuite ne relivre pas', async () => {
    const o = await insertPendingOrder({ status: 'paid', paidAt: new Date(), stripePaymentIntentId: 'pi_dp_1' });
    const r = await handleStripeEvent(
      event('charge.dispute.created', { id: 'dp_1', object: 'dispute', payment_intent: 'pi_dp_1', charge: 'ch_dp', reason: 'fraudulent', metadata: {} }),
    );
    expect(r).toMatchObject({ handled: true, orderId: o.id });
    expect(r.alert).toMatch(/litige/);
    expect((await getOrder(o.id))?.status).toBe('refunded');
    expect(delivery.enqueueRefund).toHaveBeenCalledWith(o.id);
    expect((await markOrderPaid(o.id)).deliveryId).toBeNull();
  });

  it('litige sur une commande encore pending → refunded sans révocation, jamais livrée ensuite', async () => {
    const o = await insertPendingOrder({ stripePaymentIntentId: 'pi_dp_pending' });
    expect(await markOrderRefunded(o.id)).toMatchObject({ transitioned: true, refundQueued: false });
    expect(delivery.enqueueRefund).not.toHaveBeenCalled();
    expect((await markOrderPaid(o.id)).status).toBe('refunded');
    expect(delivery.enqueueDelivery).not.toHaveBeenCalled();
  });

  it('remboursement d’un paiement inconnu → ignoré avec alerte', async () => {
    const r = await handleStripeEvent(event('charge.refunded', { id: 'ch_x', object: 'charge', payment_intent: 'pi_inconnu', refunded: true, metadata: {} }));
    expect(r.handled).toBe(false);
    expect(r.alert).toBeTruthy();
  });

  it('production : événement du mode test ignoré', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const o = await insertPendingOrder({ status: 'paid', paidAt: new Date(), stripePaymentIntentId: 'pi_rf_test' });
    const r = await handleStripeEvent(event('charge.refunded', { id: 'ch_t', object: 'charge', payment_intent: 'pi_rf_test', refunded: true, metadata: {} }, false));
    expect(r.handled).toBe(false);
    expect((await getOrder(o.id))?.status).toBe('paid');
  });
});

describe('paramètres de la session Checkout (CHARGE_MODEL, TVA)', () => {
  const order = {
    id: 'ord_p', itemTitle: 'Gemmes', productId: 'gems', playerId: 'P1', amountCents: 799, platformFeeCents: 40,
    currency: 'EUR' as const, gameId: 'gam_x', itemId: 'itm_x', termsVersion: 'cgv-v1',
  };
  const game = { name: 'Jeu', slug: 'jeu' };
  const studio = { stripeAccountId: 'acct_1', stripeChargesEnabled: true };
  const now = new Date('2026-11-09T12:00:00Z');

  it('défaut destination, Stripe Tax désactivé, session expirant avant 24 h', () => {
    const p = buildCheckoutSessionParams({ order, game, studio, origin: ORIGIN }, { now });
    expect(p.payment_intent_data).toMatchObject({ application_fee_amount: 40, transfer_data: { destination: 'acct_1' } });
    expect(p.automatic_tax).toEqual({ enabled: false });
    expect(p.line_items?.[0]?.price_data?.tax_behavior).toBeUndefined();
    expect(p.expires_at).toBe(Math.floor(now.getTime() / 1000) + CHECKOUT_SESSION_TTL_S);
    expect(CHECKOUT_SESSION_TTL_S * 1000).toBeLessThan(PENDING_ORDER_TTL_MS);
    expect(p.metadata).toMatchObject({ terms_version: 'cgv-v1', withdrawal_waiver: 'accepted', charge_model: 'destination' });
    expect(checkoutRequestOptions('ord_p', studio, 'destination')).toEqual({ idempotencyKey: 'wolleen_checkout_ord_p' });
  });

  it('direct : commission seule, requête sur le compte du studio', () => {
    const p = buildCheckoutSessionParams({ order, game, studio, origin: ORIGIN }, { model: 'direct', now });
    expect(p.payment_intent_data?.application_fee_amount).toBe(40);
    expect(p.payment_intent_data?.transfer_data).toBeUndefined();
    expect(checkoutRequestOptions('ord_p', studio, 'direct')).toEqual({ idempotencyKey: 'wolleen_checkout_ord_p', stripeAccount: 'acct_1' });
  });

  it('STRIPE_AUTOMATIC_TAX=1 : Stripe Tax activé, prix TTC (montant payé = prix affiché)', () => {
    const p = buildCheckoutSessionParams({ order, game, studio, origin: ORIGIN }, { automaticTax: true, now });
    expect(p.automatic_tax).toEqual({ enabled: true });
    expect(p.line_items?.[0]?.price_data).toMatchObject({ unit_amount: 799, tax_behavior: 'inclusive' });
  });
});

describe('IP tronquée (preuve de consentement)', () => {
  it('IPv4 → /24, IPv6 → /48, valeurs invalides → null', () => {
    expect(truncateIp('203.0.113.77')).toBe('203.0.113.0');
    expect(truncateIp('203.0.113.77:51234')).toBe('203.0.113.0');
    expect(truncateIp('::ffff:198.51.100.9')).toBe('198.51.100.0');
    expect(truncateIp('2001:db8:abcd:12::1')).toBe('2001:db8:abcd::');
    expect(truncateIp('[2001:0db8:0001:0000:0000:0000:0000:0001]:443')).toBe('2001:db8:1::');
    expect(truncateIp('::1')).toBe('0:0:0::');
    for (const bad of [null, '', 'inconnu', '999.1.1.1', '1.2.3', 'abcd', '1::2::3', '<b>x</b>']) expect(truncateIp(bad)).toBeNull();
  });
});
