import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WEBHOOK_RETRY_SCHEDULE_MS } from '@devappstore/core';
import type { Mailer } from '@devappstore/emails';
import { and, db, deliveries, eq, games, loyaltyEntries, notificationsSent, orders, refundDeliveries, studioMembers, user } from '@devappstore/db';
import { FX, getOrder, insertPendingOrder, seedPaymentsFixtures } from '@/test/payments-fixtures';
import { acknowledgeDelivery, dispatchDelivery, takeOpenDeliveries } from './delivery';
import { markOrderPaid, markOrderRefunded, payMockOrder, WITHDRAWAL_WAIVER_LABEL } from './payments';

/*
 * Branchements de la vague 3 (intégration serveur) : paiement → reçu + livraison + points, remboursement → reprise
 * des points + révocation, livraison → e-mails « livré » / « échec définitif », inscription → bienvenue.
 * Modules réels (payments, delivery, notifications, loyalty) sur une base en mémoire ; seul le transport d'e-mail
 * est remplacé par une boîte de réception en mémoire.
 */

vi.mock('@devappstore/db', async (importOriginal) => {
  const { createTestDb } = await import('@devappstore/db/testing');
  (globalThis as { __devAppStoreDb?: unknown }).__devAppStoreDb = await createTestDb();
  return importOriginal();
});

type Sent = { to: string; subject: string; text: string };
const inbox = vi.hoisted(() => [] as { to: string; subject: string; text: string }[]);
vi.mock('@devappstore/emails', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@devappstore/emails')>();
  const mailer: Mailer = {
    async send(m) {
      inbox.push({ to: m.to, subject: m.subject, text: m.text });
      return { id: `mail_${inbox.length}` };
    },
  } as Mailer;
  return { ...actual, createConsoleMailer: () => mailer, createMailerFromEnv: () => mailer };
});

const mails = (to: string, subject: RegExp): Sent[] => inbox.filter((m) => m.to === to && subject.test(m.subject));

async function sentKinds(refId: string) {
  const rows = await db.select({ kind: notificationsSent.kind, status: notificationsSent.status }).from(notificationsSent).where(eq(notificationsSent.refId, refId));
  return rows.map((r) => `${r.kind}:${r.status}`).sort();
}

async function pointsOf(orderId: string) {
  return db.select({ delta: loyaltyEntries.delta, reason: loyaltyEntries.reason }).from(loyaltyEntries).where(eq(loyaltyEntries.orderId, orderId));
}

/* ---------------------------------------------------------------- faux serveur de studio */

let server: Server;
let webhookUrl = '';
let status = 200;

beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.statusCode = status;
      res.end('ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  webhookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhook`;
  await seedPaymentsFixtures();
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(async () => {
  vi.stubEnv('LOYALTY_ENABLED', '1');
  status = 200;
  await db.update(games).set({ webhookUrl: null }).where(eq(games.id, FX.game.id));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ---------------------------------------------------------------- paiement */

describe('markOrderPaid → reçu, livraison, points (une seule fois)', () => {
  it('envoie le reçu avec la preuve de consentement enregistrée au checkout et attribue les points', async () => {
    const waiverAt = new Date('2026-11-09T13:31:58.000Z');
    const o = await insertPendingOrder({ platformFeeCents: 40, withdrawalWaiverAt: waiverAt, termsVersion: 'cgv-test-v7' });

    const first = await markOrderPaid(o.id, { paymentIntentId: 'pi_wiring_1' });
    expect(first.transitioned).toBe(true);
    expect(first.deliveryId).toMatch(/^dlv_/);

    const receipts = mails(FX.buyer.email, /reçu/i).filter((m) => m.text.includes(o.id));
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.text).toContain('cgv-test-v7'); // version stockée sur la commande, pas la version courante
    expect(receipts[0]!.text).toContain(WITHDRAWAL_WAIVER_LABEL); // libellé réellement affiché au checkout
    expect(receipts[0]!.text).toMatch(/9 novembre 2026/);
    expect(await sentKinds(o.id)).toEqual(['purchase_receipt:sent']);
    expect(await pointsOf(o.id)).toEqual([{ delta: 4, reason: 'order_award' }]); // 40 c de commission → 4 points

    // Webhook Stripe rejoué (même commande) : ni second reçu, ni seconds points, même livraison.
    const again = await markOrderPaid(o.id, { paymentIntentId: 'pi_wiring_1' });
    expect(again).toMatchObject({ transitioned: false, status: 'paid', deliveryId: first.deliveryId });
    expect(mails(FX.buyer.email, /reçu/i).filter((m) => m.text.includes(o.id))).toHaveLength(1);
    expect(await pointsOf(o.id)).toHaveLength(1);
  });

  it('commande sans preuve enregistrée (ancienne) : repli sur la date de la commande', async () => {
    const o = await insertPendingOrder();
    await markOrderPaid(o.id);
    expect(mails(FX.buyer.email, /reçu/i).filter((m) => m.text.includes(o.id))).toHaveLength(1);
  });

  it('mode simulation (payMockOrder) : même suite — reçu et points', async () => {
    const o = await insertPendingOrder({ platformFeeCents: 25 });
    await payMockOrder(FX.buyer.id, o.id);
    expect(await sentKinds(o.id)).toEqual(['purchase_receipt:sent']);
    expect(await pointsOf(o.id)).toEqual([{ delta: 2, reason: 'order_award' }]);
  });

  it('une commande remboursée n’est ni relivrée, ni notifiée, ni créditée', async () => {
    const o = await insertPendingOrder({ status: 'refunded' });
    expect(await markOrderPaid(o.id)).toMatchObject({ transitioned: false, deliveryId: null });
    expect(await sentKinds(o.id)).toEqual([]);
    expect(await pointsOf(o.id)).toEqual([]);
  });

  it('programme de fidélité fermé : le reçu part quand même, sans points', async () => {
    vi.stubEnv('LOYALTY_ENABLED', '0');
    const o = await insertPendingOrder({ platformFeeCents: 40 });
    await markOrderPaid(o.id);
    expect(await sentKinds(o.id)).toEqual(['purchase_receipt:sent']);
    expect(await pointsOf(o.id)).toEqual([]);
  });
});

/* ---------------------------------------------------------------- remboursement */

describe('markOrderRefunded → reprise des points + purchase.refunded', () => {
  it('reprend les points de la commande et crée l’événement de révocation (import direct d’enqueueRefund)', async () => {
    const o = await insertPendingOrder({ platformFeeCents: 40 });
    await markOrderPaid(o.id);
    const r = await markOrderRefunded(o.id);
    expect(r).toMatchObject({ transitioned: true, previousStatus: 'paid', refundQueued: true });
    const entries = await pointsOf(o.id);
    expect(entries.map((e) => e.reason).sort()).toEqual(['order_award', 'order_revoke']);
    expect(entries.reduce((s, e) => s + e.delta, 0)).toBe(0);
    expect(await db.select({ id: refundDeliveries.id }).from(refundDeliveries).where(eq(refundDeliveries.orderId, o.id))).toHaveLength(1);

    // Rejoué : rien de plus.
    expect(await markOrderRefunded(o.id)).toMatchObject({ transitioned: false, refundQueued: false });
    expect(await pointsOf(o.id)).toHaveLength(2);
  });
});

/* ---------------------------------------------------------------- livraison */

describe('livraison → e-mails « livré » et « échec définitif »', () => {
  it('webhook 2xx : e-mail « livré » au joueur, une seule fois (ack ensuite sans second e-mail)', async () => {
    await db.update(games).set({ webhookUrl }).where(eq(games.id, FX.game.id));
    const o = await insertPendingOrder();
    const { deliveryId } = await markOrderPaid(o.id);
    await vi.waitFor(async () => expect(await sentKinds(deliveryId!)).toEqual(['purchase_delivered:sent']));
    const [d] = await db.select({ status: deliveries.status }).from(deliveries).where(eq(deliveries.id, deliveryId!));
    expect(d!.status).toBe('delivered');

    expect(await acknowledgeDelivery(FX.game.id, deliveryId!)).toBe('ok');
    await new Promise((r) => setTimeout(r, 50));
    expect(mails(FX.buyer.email, /arrivé/).filter((m) => m.text.includes(o.id))).toHaveLength(1);
  });

  it('jeu sans webhook : la récupération par le SDK vaut livraison → e-mail « livré »', async () => {
    const o = await insertPendingOrder();
    const { deliveryId } = await markOrderPaid(o.id);
    expect(await sentKinds(deliveryId!)).toEqual([]); // encore en attente du SDK
    const events = await takeOpenDeliveries({ id: FX.game.id, webhookUrl: null }, FX.player.id);
    expect(events.map((e) => e.delivery_id)).toContain(deliveryId);
    await vi.waitFor(async () => expect(await sentKinds(deliveryId!)).toEqual(['purchase_delivered:sent']));
  });

  it('ack direct d’une livraison en attente → e-mail « livré »', async () => {
    const o = await insertPendingOrder();
    const { deliveryId } = await markOrderPaid(o.id);
    expect(await acknowledgeDelivery(FX.game.id, deliveryId!)).toBe('ok');
    await vi.waitFor(async () => expect(await sentKinds(deliveryId!)).toEqual(['purchase_delivered:sent']));
  });

  it('relances épuisées : e-mail « échec » au joueur et alerte au studio ; un échec intermédiaire ne notifie pas', async () => {
    await db.insert(user).values({ id: 'usr_dev_wiring', name: 'Dev', email: 'dev-wiring@devappstore.test' }).onConflictDoNothing();
    await db.insert(studioMembers).values({ studioId: FX.studio, userId: 'usr_dev_wiring', role: 'developer' }).onConflictDoNothing();
    await db.update(games).set({ webhookUrl }).where(eq(games.id, FX.game.id));
    status = 500;
    const o = await insertPendingOrder();
    const { deliveryId } = await markOrderPaid(o.id);
    const [first] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId!));
    expect(first).toMatchObject({ status: 'pending', attempts: 1 });
    await new Promise((r) => setTimeout(r, 50));
    expect(await sentKinds(deliveryId!)).toEqual([]);

    // Dernière tentative du planning.
    await db
      .update(deliveries)
      .set({ attempts: WEBHOOK_RETRY_SCHEDULE_MS.length, nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(deliveries.id, deliveryId!));
    await dispatchDelivery(deliveryId!);
    const [last] = await db.select({ status: deliveries.status }).from(deliveries).where(eq(deliveries.id, deliveryId!));
    expect(last!.status).toBe('failed');
    await vi.waitFor(async () => expect(await sentKinds(deliveryId!)).toEqual(['delivery_failed:sent']));
    await vi.waitFor(() => expect(mails('dev-wiring@devappstore.test', /.+/).length).toBeGreaterThanOrEqual(1));
  });

  it('remboursement livré par webhook : pas d’e-mail « livré » pour l’événement de révocation', async () => {
    const o = await insertPendingOrder();
    await markOrderPaid(o.id);
    await db.update(games).set({ webhookUrl }).where(eq(games.id, FX.game.id));
    await markOrderRefunded(o.id);
    const [rfd] = await db.select({ id: refundDeliveries.id, status: refundDeliveries.status }).from(refundDeliveries).where(eq(refundDeliveries.orderId, o.id));
    expect(rfd!.status).toBe('delivered');
    await new Promise((r) => setTimeout(r, 50));
    expect(await sentKinds(rfd!.id)).toEqual([]);
    expect((await getOrder(o.id))?.status).toBe('refunded');
  });
});

/* ---------------------------------------------------------------- inscription */

describe('inscription → bienvenue joueur / studio', () => {
  const fakeAuth = (id: string, email: string) =>
    ({
      api: {
        signUpEmail: async () => {
          await db.insert(user).values({ id, name: 'Nouveau', email }).onConflictDoNothing();
          return { user: { id } };
        },
      },
    }) as never;

  it('joueur : e-mail de bienvenue (une fois)', async () => {
    const { signUpWithPassword } = await import('./auth-flows');
    const { SlidingWindowLimiter } = await import('./auth-rate-limit');
    const r = await signUpWithPassword(
      { name: 'Nouveau', email: 'nouveau@devappstore.test', password: 'motdepasse1' },
      { auth: fakeAuth('usr_new_player', 'nouveau@devappstore.test'), limiter: new SlidingWindowLimiter() },
    );
    expect(r).toMatchObject({ ok: true, userId: 'usr_new_player' });
    await vi.waitFor(async () => expect(await sentKinds('usr_new_player')).toEqual(['player_welcome:sent']));
  });

  it('studio : bienvenue studio au propriétaire, sans bienvenue joueur en plus', async () => {
    const { signUpStudio } = await import('./auth-flows');
    const { SlidingWindowLimiter } = await import('./auth-rate-limit');
    const r = await signUpStudio(
      { studioName: 'Studio Câblé', name: 'Fondatrice', email: 'fondatrice@devappstore.test', password: 'motdepasse1' },
      { auth: fakeAuth('usr_new_owner', 'fondatrice@devappstore.test'), limiter: new SlidingWindowLimiter() },
    );
    expect(r.ok).toBe(true);
    await vi.waitFor(async () => expect(await sentKinds(r.studioId!)).toEqual(['studio_welcome:sent']));
    expect(mails('fondatrice@devappstore.test', /.+/)).toHaveLength(1);
    expect(await sentKinds('usr_new_owner')).toEqual([]);
    const [m] = await db.select().from(studioMembers).where(and(eq(studioMembers.studioId, r.studioId!), eq(studioMembers.userId, 'usr_new_owner')));
    expect(m?.role).toBe('owner');
    expect(await db.select({ id: orders.id }).from(orders).where(eq(orders.userId, 'usr_new_owner'))).toEqual([]);
  });
});
