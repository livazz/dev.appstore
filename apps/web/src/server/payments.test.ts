import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { DEFAULT_PLATFORM_FEE_BPS } from '@wolleen/core';
import { db, eq, items, orders, studios } from '@wolleen/db';
import { FX, getOrder, insertPendingOrder, seedPaymentsFixtures } from '@/test/payments-fixtures';
import {
  applyCheckoutSession,
  buildCheckoutSessionParams,
  CheckoutError,
  computePlatformFee,
  createCheckout,
  handleStripeEvent,
  markOrderPaid,
  payMockOrder,
  platformFeeBps,
  SimulationError,
} from './payments';

// Base en mémoire à la place de .data/pglite.
vi.mock('@wolleen/db', async (importOriginal) => {
  const { createTestDb } = await import('@wolleen/db/testing');
  (globalThis as { __wolleenDb?: unknown }).__wolleenDb = await createTestDb();
  return importOriginal();
});

// Contrat delivery : on vérifie l'appel, pas l'envoi au jeu (testé par la tâche « delivery »).
const delivery = vi.hoisted(() => ({ enqueueDelivery: vi.fn(async (orderId: string) => `dlv_${orderId}`) }));
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

beforeAll(async () => {
  await seedPaymentsFixtures();
});

beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('PLATFORM_FEE_BPS', '');
  delivery.enqueueDelivery.mockClear();
  fakeStripe.checkout.sessions.create.mockReset();
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
    for (const bad of ['abc', '-5', '12.5', '10001']) expect(platformFeeBps(bad)).toBe(DEFAULT_PLATFORM_FEE_BPS);
  });

  it('calcule la commission en centimes (arrondi au centime)', () => {
    expect(computePlatformFee(799, 500)).toBe(40); // 39,95 → 40
    expect(computePlatformFee(999, 250)).toBe(25); // 24,975 → 25
    expect(computePlatformFee(3999, 500)).toBe(200); // 199,95 → 200
    expect(computePlatformFee(1000, 0)).toBe(0);
  });

  it('fige la commission de PLATFORM_FEE_BPS dans la commande', async () => {
    vi.stubEnv('PLATFORM_FEE_BPS', '1000');
    const r = await createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN });
    expect((await getOrder(r.orderId))?.platformFeeCents).toBe(80);
  });
});

describe('createCheckout — mode simulation', () => {
  it('crée une commande pending figée et renvoie /checkout/mock', async () => {
    const r = await createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN });
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
    const r = await createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN });
    await db.update(items).set({ priceCents: 1299, title: 'Renommé' }).where(eq(items.id, FX.item));
    try {
      expect(await getOrder(r.orderId)).toMatchObject({ amountCents: 799, itemTitle: 'Sac de gemmes' });
    } finally {
      await db.update(items).set({ priceCents: 799, title: 'Sac de gemmes' }).where(eq(items.id, FX.item));
    }
  });

  it("refuse si le compte de jeu n'est pas lié (→ page de liaison), sans créer de commande", async () => {
    const err = await expectCheckoutError(createCheckout({ user: FX.stranger, itemId: FX.item, origin: ORIGIN }), 'not_linked');
    expect(err.status).toBe(409);
    expect(err.redirect).toBe(`/games/${FX.game.slug}/link?item=${FX.item}`);
    expect(await ordersOf(FX.stranger.id)).toHaveLength(0);
  });

  it('refuse un article inactif, inconnu, ou d’un jeu non publié', async () => {
    const before = (await ordersOf(FX.buyer.id)).length;
    for (const itemId of [FX.inactiveItem, FX.draftItem, 'itm_inconnu']) {
      const err = await expectCheckoutError(createCheckout({ user: FX.buyer, itemId, origin: ORIGIN }), 'item_unavailable');
      expect(err.status).toBe(404);
    }
    expect(await ordersOf(FX.buyer.id)).toHaveLength(before);
  });

  it('refuse un prix sous le minimum Stripe', async () => {
    await expectCheckoutError(createCheckout({ user: FX.buyer, itemId: FX.cheapItem, origin: ORIGIN }), 'amount_too_low');
  });

  it('mode simulation interdit en production (NODE_ENV=production sans clé → erreur, aucune commande)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const before = (await ordersOf(FX.buyer.id)).length;
    const err = await expectCheckoutError(createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN }), 'payments_unavailable');
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
    const r = await createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN });
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
    const err = await expectCheckoutError(createCheckout({ user: FX.buyer, itemId: FX.item, origin: ORIGIN }), 'payment_provider_error');
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
