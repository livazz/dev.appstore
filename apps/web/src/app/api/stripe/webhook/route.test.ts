import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
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

function completedEvent(orderId: string, sessionId: string) {
  return JSON.stringify({
    id: 'evt_test_completed',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        metadata: { order_id: orderId },
        client_reference_id: orderId,
        amount_subtotal: 799,
        amount_total: 799,
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

  it('erreur de traitement → 500 pour que Stripe réessaie', async () => {
    const o = await insertPendingOrder({ stripeCheckoutSessionId: 'cs_retry' });
    delivery.enqueueDelivery.mockRejectedValueOnce(new Error('base indisponible'));
    const payload = completedEvent(o.id, 'cs_retry');
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    expect((await POST(webhookRequest(payload, signature))).status).toBe(500);
    // Rejeu : la commande est déjà payée, la livraison est (re)demandée.
    expect((await POST(webhookRequest(payload, signature))).status).toBe(200);
    expect(delivery.enqueueDelivery).toHaveBeenCalledTimes(2);
  });
});
