import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { db, eq, stripeEvents } from '@wolleen/db';
import { FX, getOrder, insertPendingOrder, seedPaymentsFixtures } from '@/test/payments-fixtures';
import { POST } from './route';

vi.mock('@wolleen/db', async (importOriginal) => {
  const { createTestDb } = await import('@wolleen/db/testing');
  (globalThis as { __wolleenDb?: unknown }).__wolleenDb = await createTestDb();
  return importOriginal();
});

const delivery = vi.hoisted(() => ({ enqueueDelivery: vi.fn(async (orderId: string) => `dlv_${orderId}`) }));
vi.mock('@/server/delivery', () => delivery);

const SECRET = 'whsec_test_wolleen';

let evtSeq = 0;

function completedEvent(orderId: string, sessionId: string, opts: { id?: string; amount?: number; livemode?: boolean } = {}) {
  return JSON.stringify({
    id: opts.id ?? `evt_test_completed_${++evtSeq}`,
    object: 'event',
    type: 'checkout.session.completed',
    ...(opts.livemode !== undefined ? { livemode: opts.livemode } : {}),
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        metadata: { order_id: orderId },
        client_reference_id: orderId,
        amount_subtotal: opts.amount ?? 799,
        amount_total: opts.amount ?? 799,
        currency: 'eur',
        payment_status: 'paid',
        payment_intent: 'pi_webhook',
        status: 'complete',
      },
    },
  });
}

function webhookRequest(payload: string, signature?: string) {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(signature ? { 'stripe-signature': signature } : {}) },
    body: payload,
  });
}

beforeAll(async () => {
  await seedPaymentsFixtures();
});

beforeEach(() => {
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRET);
  vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', '');
  delivery.enqueueDelivery.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/stripe/webhook', () => {
  it('signature invalide → 400, commande inchangée', async () => {
    const o = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_bad_sig' });
    const payload = completedEvent(o.id, 'cs_bad_sig');
    const res = await POST(webhookRequest(payload, 't=123,v1=deadbeef'));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_signature');
    expect((await getOrder(o.id))?.status).toBe('pending');
    expect(delivery.enqueueDelivery).not.toHaveBeenCalled();
  });

  it('signée avec un autre secret → 400', async () => {
    const o = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_other_secret' });
    const payload = completedEvent(o.id, 'cs_other_secret');
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_pirate' });
    expect((await POST(webhookRequest(payload, signature))).status).toBe(400);
    expect((await getOrder(o.id))?.status).toBe('pending');
  });

  it('corps modifié après signature → 400', async () => {
    const o = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_tampered' });
    const payload = completedEvent(o.id, 'cs_tampered');
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    expect((await POST(webhookRequest(payload.replace('799', '1'), signature))).status).toBe(400);
  });

  it('signature absente → 400', async () => {
    expect((await POST(webhookRequest('{}'))).status).toBe(400);
  });

  it('webhook non configuré → 500 (Stripe réessaiera)', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    expect((await POST(webhookRequest('{}', 't=1,v1=x'))).status).toBe(500);
  });

  it('checkout.session.completed signé → 200, commande payée une seule fois', async () => {
    const o = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_good' });
    const payload = completedEvent(o.id, 'cs_good');
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });

    const res = await POST(webhookRequest(payload, signature));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, handled: true });
    const paid = await getOrder(o.id);
    expect(paid).toMatchObject({ status: 'paid', stripePaymentIntentId: 'pi_webhook', userId: FX.buyer.id });

    // Stripe rejoue l'événement : toujours 200, paidAt inchangé.
    const replay = await POST(webhookRequest(payload, signature));
    expect(replay.status).toBe(200);
    expect((await getOrder(o.id))?.paidAt?.getTime()).toBe(paid?.paidAt?.getTime());
    expect(delivery.enqueueDelivery).toHaveBeenCalledWith(o.id);
  });

  it('accepte aussi le secret de l’endpoint Connect', async () => {
    vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'whsec_connect');
    const payload = JSON.stringify({ id: 'evt_acc', object: 'event', type: 'account.updated', data: { object: { id: 'acct_inconnu', object: 'account', charges_enabled: true } } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_connect' });
    const res = await POST(webhookRequest(payload, signature));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, handled: false });
  });

  it('erreur de traitement → 500 pour que Stripe réessaie (le rejeu du même event.id est retraité)', async () => {
    const o = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_retry' });
    delivery.enqueueDelivery.mockRejectedValueOnce(new Error('base indisponible'));
    const payload = completedEvent(o.id, 'cs_retry', { id: 'evt_retry' });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    expect((await POST(webhookRequest(payload, signature))).status).toBe(500);
    // Rejeu : la commande est déjà payée, la livraison est (re)demandée.
    expect((await POST(webhookRequest(payload, signature))).status).toBe(200);
    expect(delivery.enqueueDelivery).toHaveBeenCalledTimes(2);
  });
  // CHK-PAY-06 : tolérance d'horodatage (anti-rejeu d'une signature ancienne).
  it('signature valide mais horodatage trop ancien (> 300 s) → 400', async () => {
    const o = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_old' });
    const payload = completedEvent(o.id, 'cs_old');
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) - 600 });
    expect((await POST(webhookRequest(payload, signature))).status).toBe(400);
    expect((await getOrder(o.id))?.status).toBe('pending');
  });

  it('signature sur un JSON re-sérialisé (espaces modifiés) → 400 : seule la chaîne brute est acceptée', async () => {
    const o = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_raw' });
    const payload = JSON.stringify(JSON.parse(completedEvent(o.id, 'cs_raw')), null, 2);
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    expect((await POST(webhookRequest(JSON.stringify(JSON.parse(payload)), signature))).status).toBe(400);
    expect((await getOrder(o.id))?.status).toBe('pending');
  });

  // CHK-PAY-07 : idempotence par event.id.
  it('même event.id rejoué → traité une seule fois (doublon signalé, une seule demande de livraison)', async () => {
    const o = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_idem' });
    const payload = completedEvent(o.id, 'cs_idem', { id: 'evt_idem' });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    expect(await (await POST(webhookRequest(payload, signature))).json()).toEqual({ received: true, handled: true });
    expect(await (await POST(webhookRequest(payload, signature))).json()).toEqual({ received: true, handled: true, duplicate: true });
    expect(delivery.enqueueDelivery).toHaveBeenCalledTimes(1);
    const [row] = await db.select().from(stripeEvents).where(eq(stripeEvents.id, 'evt_idem'));
    expect(row).toMatchObject({ type: 'checkout.session.completed', orderId: o.id });
    expect(row?.processedAt).toBeInstanceOf(Date);
  });

  // CHK-PAY-08 : montant comparé à la commande avant markOrderPaid.
  it('événement signé avec un montant différent → commande non payée, alerte enregistrée, aucune livraison', async () => {
    const o = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_wrong_amount' });
    const payload = completedEvent(o.id, 'cs_wrong_amount', { id: 'evt_wrong_amount', amount: 1 });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const res = await POST(webhookRequest(payload, signature));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, handled: false });
    expect((await getOrder(o.id))?.status).toBe('pending');
    expect(delivery.enqueueDelivery).not.toHaveBeenCalled();
    const [row] = await db.select().from(stripeEvents).where(eq(stripeEvents.id, 'evt_wrong_amount'));
    expect(row?.alert).toMatch(/incohérents/);
  });

  it('production : événement du mode test ignoré, sauf WOLLEEN_ALLOW_TEST_PAYMENTS=1', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const o = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_testmode' });
    const payload = completedEvent(o.id, 'cs_testmode', { livemode: false });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    expect(await (await POST(webhookRequest(payload, signature))).json()).toEqual({ received: true, handled: false });
    expect((await getOrder(o.id))?.status).toBe('pending');

    vi.stubEnv('WOLLEEN_ALLOW_TEST_PAYMENTS', '1');
    const payload2 = completedEvent(o.id, 'cs_testmode', { livemode: false });
    const signature2 = Stripe.webhooks.generateTestHeaderString({ payload: payload2, secret: SECRET });
    expect(await (await POST(webhookRequest(payload2, signature2))).json()).toEqual({ received: true, handled: true });
    expect((await getOrder(o.id))?.status).toBe('paid');
  });

  it('charge.refunded signé → commande refunded', async () => {
    const o = await insertPendingOrder({ status: 'paid', paidAt: new Date(), stripePaymentIntentId: 'pi_refund_route' });
    const payload = JSON.stringify({
      id: 'evt_refund_route',
      object: 'event',
      type: 'charge.refunded',
      data: { object: { id: 'ch_1', object: 'charge', payment_intent: 'pi_refund_route', refunded: true, amount: 799, amount_refunded: 799, metadata: {} } },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    expect((await POST(webhookRequest(payload, signature))).status).toBe(200);
    expect((await getOrder(o.id))?.status).toBe('refunded');
  });

  it('corps trop volumineux → 413', async () => {
    const big = 'x'.repeat(1024 * 1024 + 1);
    expect((await POST(webhookRequest(big, 't=1,v1=x'))).status).toBe(413);
  });
});
