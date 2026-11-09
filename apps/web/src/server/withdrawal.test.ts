/*
 * Rétractation en ligne (int/security, docs/legal/consumer.md § 2.4) : éligibilité (payée, non livrée, < 14 jours),
 * arrêt atomique de la livraison, remboursement (Stripe ou simulation), événement purchase.refunded.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME } from '@devappstore/core';
import type { DB } from '@devappstore/db';

vi.mock('server-only', () => ({}));
vi.mock('@devappstore/db', async () => {
  const schema = await import('@devappstore/db/schema');
  const orm = await import('drizzle-orm');
  const { createTestDb } = await import('@devappstore/db/testing');
  return { ...schema, schema, ...orm, db: await createTestDb() };
});

// L'accusé de réception part en arrière-plan : on l'observe (et on peut le faire échouer) sans envoyer d'e-mail.
const ack = vi.hoisted(() => ({ calls: [] as { orderId: string; opts: Record<string, unknown> }[], fail: false }));
vi.mock('./notifications', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./notifications')>();
  return {
    ...orig,
    runInBackground: (_label: string, task: () => Promise<unknown>) => void task().catch(() => undefined),
    sendWithdrawalAcknowledgement: vi.fn(async (orderId: string, opts: Record<string, unknown>) => {
      ack.calls.push({ orderId, opts });
      if (ack.fail) throw new Error('transport en panne');
      return { ok: true, status: 'sent', recipients: [] };
    }),
  };
});

const D = await import('@devappstore/db');
const db = D.db as DB;
const { enqueueDelivery, retryDelivery } = await import('./delivery');
const W = await import('./withdrawal');

const NOW = new Date('2026-11-09T12:00:00Z');
const DAY = 24 * 3600_000;
let seq = 0;

beforeAll(async () => {
  await db.insert(D.user).values(['usr_buyer', 'usr_other'].map((id) => ({ id, name: id, email: `${id}@t.test`, emailVerified: true })));
  await db.insert(D.studios).values({ id: 'std_w', name: 'W', slug: 'w', stripeAccountId: 'acct_studio', stripeChargesEnabled: true });
  // Jeu sans webhook (SDK) : la livraison reste `pending` tant que le jeu ne l'a pas récupérée.
  await db.insert(D.games).values({
    id: 'gam_w', studioId: 'std_w', slug: 'gam_w', name: 'Jeu W', theme: DEFAULT_THEME, status: 'live',
    webhookSecret: 'whsec_w', apiKeyHash: 'h_w', apiKeyPrefix: 'das_secret_w',
  });
  await db.insert(D.items).values({ id: 'itm_w', gameId: 'gam_w', productId: 'gems', title: 'Gemmes', priceCents: 499, style: {} as never });
}, 60_000);

async function paidOrder(o: { amount?: number; ageMs?: number; user?: string; pi?: string | null } = {}) {
  const id = `ord_w${++seq}`;
  const created = new Date(NOW.getTime() - (o.ageMs ?? DAY));
  await db.insert(D.orders).values({
    id, userId: o.user ?? 'usr_buyer', gameId: 'gam_w', itemId: 'itm_w', productId: 'gems', itemTitle: 'Gemmes', playerId: 'P1',
    amountCents: o.amount ?? 499, platformFeeCents: 25, currency: 'EUR', status: 'paid', createdAt: created, paidAt: created,
    stripePaymentIntentId: o.pi === undefined ? `pi_${id}` : o.pi,
  });
  const deliveryId = await enqueueDelivery(id);
  return { id, deliveryId };
}

const orderRow = async (id: string) => (await db.select().from(D.orders).where(D.eq(D.orders.id, id)))[0]!;
const deliveryRow = async (orderId: string) => (await db.select().from(D.deliveries).where(D.eq(D.deliveries.orderId, orderId)))[0]!;
const refundRows = async (orderId: string) => db.select().from(D.refundDeliveries).where(D.eq(D.refundDeliveries.orderId, orderId));
const sim = { now: NOW, stripe: null, simulationAllowed: true } as const;

function fakeStripe(opts: { transfer?: boolean; failRefund?: boolean } = {}) {
  const calls: { params: Record<string, unknown>; options: Record<string, unknown> }[] = [];
  const retrieves: { id: string; options: Record<string, unknown> }[] = [];
  const stripe = {
    refunds: {
      create: vi.fn(async (params: Record<string, unknown>, options: Record<string, unknown>) => {
        calls.push({ params, options });
        if (opts.failRefund) throw new Error('Stripe indisponible');
        return { id: `re_${String(params.payment_intent)}` };
      }),
    },
    paymentIntents: {
      retrieve: vi.fn(async (id: string, _p: unknown, options: Record<string, unknown>) => {
        retrieves.push({ id, options });
        return { id, transfer_data: opts.transfer ? { destination: 'acct_studio' } : null };
      }),
    },
    checkout: { sessions: { retrieve: vi.fn(async () => ({ payment_intent: 'pi_from_session' })) } },
  };
  return { stripe: stripe as never, calls, retrieves };
}

describe('éligibilité', () => {
  it('withdrawalBlocker : payée, montant > 0, < 14 jours, livraison pending ou failed (relances épuisées, arrêt pour rétractation)', () => {
    const base = { status: 'paid' as const, amountCents: 499, createdAt: new Date(NOW.getTime() - DAY), deliveryStatus: 'pending' as const, deliveryLastError: null };
    expect(W.withdrawalBlocker(base, NOW)).toBeNull();
    expect(W.withdrawalBlocker({ ...base, status: 'refunded' }, NOW)).toBe('not_paid');
    expect(W.withdrawalBlocker({ ...base, amountCents: 0 }, NOW)).toBe('free_order');
    expect(W.withdrawalBlocker({ ...base, createdAt: new Date(NOW.getTime() - 14 * DAY) }, NOW)).toBe('period_expired');
    expect(W.withdrawalBlocker({ ...base, createdAt: new Date(NOW.getTime() - 14 * DAY + 60_000) }, NOW)).toBeNull();
    for (const s of ['delivered', 'acknowledged'] as const) expect(W.withdrawalBlocker({ ...base, deliveryStatus: s }, NOW)).toBe('already_delivered');
    // Relances épuisées : rien n'a été crédité, la rétractation reste possible (consumer.md § 2.4).
    expect(W.withdrawalBlocker({ ...base, deliveryStatus: 'failed', deliveryLastError: 'HTTP 500' }, NOW)).toBeNull();
    expect(W.withdrawalBlocker({ ...base, deliveryStatus: 'failed', deliveryLastError: W.WITHDRAWAL_STOP_REASON }, NOW)).toBeNull();
    expect(W.withdrawalBlocker({ ...base, deliveryStatus: null }, NOW)).toBe('already_delivered');
  });

  it('withdrawableOrderIds : seulement les commandes rétractables de l’utilisateur', async () => {
    const ok = await paidOrder();
    const old = await paidOrder({ ageMs: 15 * DAY });
    const delivered = await paidOrder();
    await db.update(D.deliveries).set({ status: 'delivered' }).where(D.eq(D.deliveries.id, delivered.deliveryId));
    const free = await paidOrder({ amount: 0 });
    const foreign = await paidOrder({ user: 'usr_other' });
    const ids = await W.withdrawableOrderIds('usr_buyer', [ok.id, old.id, delivered.id, free.id, foreign.id], NOW);
    expect([...ids]).toEqual([ok.id]);
    expect((await W.withdrawableOrderIds('usr_buyer', [], NOW)).size).toBe(0);
  });
});

describe('withdrawOrder', () => {
  it('simulation : arrête la livraison, passe la commande à refunded et émet purchase.refunded', async () => {
    const { id, deliveryId } = await paidOrder();
    const r = await W.withdrawOrder('usr_buyer', id, sim);
    expect(r).toMatchObject({ orderId: id, mode: 'simulation', refundId: null });
    expect(await orderRow(id)).toMatchObject({ status: 'refunded', refundedAt: NOW });
    expect(await deliveryRow(id)).toMatchObject({ id: deliveryId, status: 'failed', nextAttemptAt: null, lastError: W.WITHDRAWAL_STOP_REASON });
    const refunds = await refundRows(id);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ purchaseDeliveryId: deliveryId, status: 'pending' });
    expect(refunds[0]!.payload).toMatchObject({ event: 'purchase.refunded', order_id: id });
    expect(r.refundDeliveryId).toBe(refunds[0]!.id);
    // Plus rétractable ensuite.
    await expect(W.withdrawOrder('usr_buyer', id, sim)).rejects.toMatchObject({ code: 'not_paid' });
  });

  it('refuse un achat déjà livré, hors délai, gratuit ou d’un autre compte, sans rien modifier', async () => {
    const delivered = await paidOrder();
    await db.update(D.deliveries).set({ status: 'acknowledged' }).where(D.eq(D.deliveries.id, delivered.deliveryId));
    await expect(W.withdrawOrder('usr_buyer', delivered.id, sim)).rejects.toMatchObject({ code: 'already_delivered' });
    expect((await orderRow(delivered.id)).status).toBe('paid');
    expect((await deliveryRow(delivered.id)).status).toBe('acknowledged');

    const old = await paidOrder({ ageMs: 14 * DAY + 1 });
    await expect(W.withdrawOrder('usr_buyer', old.id, sim)).rejects.toMatchObject({ code: 'period_expired' });
    expect((await deliveryRow(old.id)).status).toBe('pending');

    const free = await paidOrder({ amount: 0 });
    await expect(W.withdrawOrder('usr_buyer', free.id, sim)).rejects.toMatchObject({ code: 'free_order' });

    const mine = await paidOrder();
    await expect(W.withdrawOrder('usr_other', mine.id, sim)).rejects.toMatchObject({ code: 'not_found' });
    await expect(W.withdrawOrder('usr_buyer', 'ord_inconnue', sim)).rejects.toMatchObject({ code: 'not_found' });
    await expect(W.withdrawOrder('usr_buyer', 'x'.repeat(65), sim)).rejects.toMatchObject({ code: 'not_found' });
    expect((await deliveryRow(mine.id)).status).toBe('pending');
    expect(await refundRows(mine.id)).toHaveLength(0);
  });

  it('sans Stripe ni simulation (production mal configurée) : refus explicite, livraison suspendue, relance possible', async () => {
    const { id } = await paidOrder();
    await expect(W.withdrawOrder('usr_buyer', id, { now: NOW, stripe: null, simulationAllowed: false })).rejects.toMatchObject({ code: 'refund_unavailable' });
    expect((await orderRow(id)).status).toBe('paid');
    expect((await W.withdrawableOrderIds('usr_buyer', [id], NOW)).has(id)).toBe(true);
  });

  it('Stripe, charge à destination : transfert annulé et commission remboursée, idempotent par commande', async () => {
    const { id } = await paidOrder();
    const f = fakeStripe({ transfer: true });
    const r = await W.withdrawOrder('usr_buyer', id, { now: NOW, stripe: f.stripe });
    expect(r).toMatchObject({ mode: 'stripe', refundId: `re_pi_${id}` });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.params).toMatchObject({
      payment_intent: `pi_${id}`, reason: 'requested_by_customer', reverse_transfer: true, refund_application_fee: true,
      metadata: { order_id: id, devappstore_reason: 'withdrawal' },
    });
    expect(f.calls[0]!.options).toEqual({ idempotencyKey: `devappstore_withdrawal_${id}` });
    expect((await orderRow(id)).status).toBe('refunded');
    expect(await refundRows(id)).toHaveLength(1);
  });

  it('Stripe, charge directe (CHARGE_MODEL=direct) : remboursement sur le compte du studio, commission remboursée', async () => {
    const { id } = await paidOrder();
    const f = fakeStripe();
    vi.stubEnv('CHARGE_MODEL', 'direct');
    try {
      await W.withdrawOrder('usr_buyer', id, { now: NOW, stripe: f.stripe });
    } finally {
      vi.unstubAllEnvs();
    }
    expect(f.calls[0]!.params).toMatchObject({ payment_intent: `pi_${id}`, refund_application_fee: true });
    expect(f.calls[0]!.params).not.toHaveProperty('reverse_transfer');
    expect(f.calls[0]!.options).toEqual({ stripeAccount: 'acct_studio', idempotencyKey: `devappstore_withdrawal_${id}` });
  });

  it('Stripe, paiement sur la plateforme sans transfert : remboursement simple ; PaymentIntent retrouvé via la session', async () => {
    const { id } = await paidOrder({ pi: null });
    await db.update(D.orders).set({ stripeCheckoutSessionId: `cs_${id}` }).where(D.eq(D.orders.id, id));
    const f = fakeStripe({ transfer: false });
    await W.withdrawOrder('usr_buyer', id, { now: NOW, stripe: f.stripe });
    expect(f.calls[0]!.params).toMatchObject({ payment_intent: 'pi_from_session' });
    expect(f.calls[0]!.params).not.toHaveProperty('reverse_transfer');
  });

  it('Stripe en échec : livraison suspendue, commande toujours payée ; la relance rembourse une seule fois', async () => {
    const { id } = await paidOrder();
    const broken = fakeStripe({ failRefund: true, transfer: true });
    await expect(W.withdrawOrder('usr_buyer', id, { now: NOW, stripe: broken.stripe })).rejects.toMatchObject({ code: 'refund_failed' });
    expect((await orderRow(id)).status).toBe('paid');
    expect(await deliveryRow(id)).toMatchObject({ status: 'failed', lastError: W.WITHDRAWAL_STOP_REASON });
    expect(await refundRows(id)).toHaveLength(0);
    expect((await W.withdrawableOrderIds('usr_buyer', [id], NOW)).has(id)).toBe(true);

    const ok = fakeStripe({ transfer: true });
    await W.withdrawOrder('usr_buyer', id, { now: NOW, stripe: ok.stripe });
    // Même clé d'idempotence que la tentative échouée : Stripe ne rembourse jamais deux fois.
    expect(ok.calls[0]!.options.idempotencyKey).toBe(broken.calls[0]!.options.idempotencyKey);
    expect((await orderRow(id)).status).toBe('refunded');
  });

  it('livraison confirmée par le jeu au même moment : jamais rétractation ET livraison', async () => {
    const { id, deliveryId } = await paidOrder();
    const results = await Promise.allSettled([
      W.withdrawOrder('usr_buyer', id, sim),
      db.update(D.deliveries).set({ status: 'delivered' }).where(D.and(D.eq(D.deliveries.id, deliveryId), D.eq(D.deliveries.status, 'pending'))).returning(),
    ]);
    const withdrew = results[0].status === 'fulfilled';
    const d = await deliveryRow(id);
    if (withdrew) expect(d.status).toBe('failed');
    else {
      expect(d.status).toBe('delivered');
      expect((await orderRow(id)).status).toBe('paid');
    }
  });

  it('deux demandes simultanées : un seul remboursement et un seul événement', async () => {
    const { id } = await paidOrder();
    const f = fakeStripe({ transfer: true });
    const results = await Promise.allSettled([
      W.withdrawOrder('usr_buyer', id, { now: NOW, stripe: f.stripe }),
      W.withdrawOrder('usr_buyer', id, { now: NOW, stripe: f.stripe }),
    ]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(new Set(f.calls.map((c) => c.options.idempotencyKey)).size).toBe(1);
    expect((await orderRow(id)).status).toBe('refunded');
    expect(await refundRows(id)).toHaveLength(1);
  });

  it('livraison en échec (relances épuisées) : rétractable, arrêtée atomiquement, jamais relancée ensuite', async () => {
    const { id, deliveryId } = await paidOrder();
    await db.update(D.deliveries).set({ status: 'failed', attempts: 8, lastError: 'HTTP 503', nextAttemptAt: null }).where(D.eq(D.deliveries.id, deliveryId));
    expect((await W.withdrawableOrderIds('usr_buyer', [id], NOW)).has(id)).toBe(true);
    await W.withdrawOrder('usr_buyer', id, sim);
    expect(await deliveryRow(id)).toMatchObject({ status: 'failed', nextAttemptAt: null, lastError: W.WITHDRAWAL_STOP_REASON });
    expect((await orderRow(id)).status).toBe('refunded');
    expect(await refundRows(id)).toHaveLength(1);
    // Bouton « Relancer » du studio : refusé (commande remboursée, motif de rétractation).
    expect(await retryDelivery('gam_w', deliveryId)).toBe('not_retryable');
    expect((await deliveryRow(id)).status).toBe('failed');
  });

  it('retryDelivery ne relance pas une livraison arrêtée pour rétractation dont le remboursement a échoué', async () => {
    const { id, deliveryId } = await paidOrder();
    await expect(W.withdrawOrder('usr_buyer', id, { now: NOW, stripe: fakeStripe({ failRefund: true }).stripe })).rejects.toMatchObject({ code: 'refund_failed' });
    expect((await orderRow(id)).status).toBe('paid');
    expect(await retryDelivery('gam_w', deliveryId)).toBe('not_retryable');
    expect(await deliveryRow(id)).toMatchObject({ status: 'failed', lastError: W.WITHDRAWAL_STOP_REASON });
    // Une livraison en échec « ordinaire » reste relançable.
    const other = await paidOrder();
    await db.update(D.deliveries).set({ status: 'failed', lastError: 'HTTP 503', nextAttemptAt: null }).where(D.eq(D.deliveries.id, other.deliveryId));
    expect(await retryDelivery('gam_w', other.deliveryId)).toBe('ok');
    expect((await deliveryRow(other.id)).status).toBe('pending');
  });

  it('accusé de réception envoyé après succès (date de la demande, délai, mode) ; son échec n’annule pas la rétractation', async () => {
    ack.calls.length = 0;
    const { id } = await paidOrder();
    await W.withdrawOrder('usr_buyer', id, sim);
    await vi.waitFor(() => expect(ack.calls.some((c) => c.orderId === id)).toBe(true));
    expect(ack.calls.find((c) => c.orderId === id)!.opts).toMatchObject({ requestedAt: NOW, refundDays: 14, simulated: true });

    // Pas d'accusé quand la rétractation échoue.
    const failing = await paidOrder();
    await expect(W.withdrawOrder('usr_buyer', failing.id, { now: NOW, stripe: null, simulationAllowed: false })).rejects.toBeTruthy();
    expect(ack.calls.some((c) => c.orderId === failing.id)).toBe(false);

    ack.fail = true;
    try {
      const other = await paidOrder();
      await expect(W.withdrawOrder('usr_buyer', other.id, sim)).resolves.toMatchObject({ orderId: other.id });
      await vi.waitFor(() => expect(ack.calls.some((c) => c.orderId === other.id)).toBe(true));
      expect((await orderRow(other.id)).status).toBe('refunded');
    } finally {
      ack.fail = false;
    }
  });
});
