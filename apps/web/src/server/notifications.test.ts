import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_THEME } from '@devappstore/core';
import { deliveries, eq, gameLinks, games, notificationsSent, orders, studioMembers, studios, user, webhookAttempts, type DB } from '@devappstore/db';
import { createTestDb } from '@devappstore/db/testing';
import type { Mailer, MailMessage } from '@devappstore/emails';
import {
  computeWeeklySales,
  previousWeekStart,
  sendAllWeeklyReports,
  sendDeliveryFailed,
  sendPlayerWelcome,
  sendPurchaseDelivered,
  sendPurchaseReceipt,
  sendStudioWelcome,
  sendWeeklyStudioReport,
  sendWithdrawalAcknowledgement,
  startOfWeekUtc,
  type NotifyDeps,
} from './notifications';

let database: DB;
let outbox: MailMessage[] = [];
let failNext = 0;
const logs: string[] = [];

const mailer: Mailer = {
  async send(m) {
    if (failNext > 0) {
      failNext--;
      throw new Error('Resend a refusé l’envoi (500)');
    }
    outbox.push(m);
    return { id: `mem_${outbox.length}` };
  },
};

const NOW = new Date('2026-11-09T10:00:00Z'); // lundi
const deps = (extra: Partial<NotifyDeps> = {}): NotifyDeps => ({
  database,
  mailer,
  now: NOW,
  context: { appUrl: 'https://devappstore.test' },
  log: (m) => logs.push(m),
  ...extra,
});

let seq = 0;
async function makeOrder(opts: { status?: 'paid' | 'pending'; paidAt?: Date; amountCents?: number; gameId?: string; title?: string } = {}) {
  const id = `ord_${++seq}`;
  await database.insert(orders).values({
    id,
    userId: 'usr_p',
    gameId: opts.gameId ?? 'gam_a',
    itemId: opts.gameId === 'gam_b' ? 'itm_b' : 'itm_a',
    productId: 'gems_500',
    itemTitle: opts.title ?? '500 gemmes',
    playerId: 'P-42',
    quantity: 1,
    amountCents: opts.amountCents ?? 499,
    platformFeeCents: Math.round((opts.amountCents ?? 499) * 0.05),
    currency: 'EUR',
    status: opts.status ?? 'paid',
    paidAt: opts.status === 'pending' ? null : (opts.paidAt ?? NOW),
    createdAt: opts.paidAt ?? NOW,
  });
  return id;
}

async function makeDelivery(orderId: string, status: 'pending' | 'delivered' | 'failed', gameId = 'gam_a') {
  const id = `dlv_${orderId}`;
  await database.insert(deliveries).values({
    id,
    orderId,
    gameId,
    playerId: 'P-42',
    payload: {} as never,
    status,
    attempts: status === 'failed' ? 8 : 1,
    lastError: status === 'failed' ? 'HTTP 503' : null,
    deliveredAt: status === 'delivered' ? NOW : null,
    createdAt: NOW,
  });
  return id;
}

beforeAll(async () => {
  database = await createTestDb();
  await database.insert(user).values([
    { id: 'usr_p', name: 'Léa', email: 'lea@test.dev', emailVerified: true },
    { id: 'usr_owner', name: 'Olivier', email: 'owner@studio.dev', emailVerified: true },
    { id: 'usr_dev', name: 'Dana', email: 'dev@studio.dev', emailVerified: true },
    { id: 'usr_fin', name: 'Fanny', email: 'fin@studio.dev', emailVerified: true },
  ]);
  await database.insert(studios).values({ id: 'std_n', name: 'Nova <Games>', slug: 'nova' });
  await database.insert(studioMembers).values([
    { studioId: 'std_n', userId: 'usr_owner', role: 'owner' },
    { studioId: 'std_n', userId: 'usr_dev', role: 'developer' },
    { studioId: 'std_n', userId: 'usr_fin', role: 'finance' },
  ]);
  const game = (id: string, name: string) => ({
    id,
    studioId: 'std_n',
    slug: id,
    name,
    theme: DEFAULT_THEME,
    webhookUrl: 'https://game.test/hook',
    webhookSecret: 'whsec',
    apiKeyHash: `h_${id}`,
    apiKeyPrefix: `das_${id}`,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });
  await database.insert(games).values([game('gam_a', 'Crystal Quest'), game('gam_b', 'Farm')]);
  const { items } = await import('@devappstore/db');
  const item = (id: string, gameId: string) => ({ id, gameId, productId: 'gems_500', title: '500 gemmes', priceCents: 499, style: {} as never });
  await database.insert(items).values([item('itm_a', 'gam_a'), item('itm_b', 'gam_b')]);
  await database.insert(gameLinks).values({ id: 'lnk_1', userId: 'usr_p', gameId: 'gam_a', playerId: 'P-42', playerName: 'DragonSlayer', method: 'code', verified: 1 });
});

beforeEach(() => {
  outbox = [];
  failNext = 0;
  logs.length = 0;
});

describe('sendWithdrawalAcknowledgement', () => {
  it('accusé de réception sur support durable, une seule fois par commande remboursée', async () => {
    const orderId = await makeOrder();
    // Pas encore remboursée : rien n'est réservé.
    expect(await sendWithdrawalAcknowledgement(orderId, deps())).toEqual({ ok: true, status: 'skipped', reason: 'not_refunded' });
    const requestedAt = new Date('2026-11-09T09:30:00Z');
    await database.update(orders).set({ status: 'refunded', refundedAt: requestedAt }).where(eq(orders.id, orderId));

    const r1 = await sendWithdrawalAcknowledgement(orderId, { ...deps(), refundDays: 14, simulated: false });
    expect(r1).toEqual({ ok: true, status: 'sent', recipients: ['lea@test.dev'] });
    const m = outbox[0]!;
    expect(m.to).toBe('lea@test.dev');
    expect(m.subject).toContain('rétractation');
    expect(m.text).toContain(orderId);
    expect(m.text).toContain('500 gemmes');
    expect(m.text).toContain('Crystal Quest');
    expect(m.text).toContain('DragonSlayer');
    expect(m.text).toMatch(/4,99\s?€/);
    expect(m.text).toContain('9 novembre 2026 à 10:30:00'); // date de la demande (refundedAt), heure de Paris
    expect(m.text).toContain('23 novembre 2026'); // délai de remboursement : 14 jours
    expect(m.text.startsWith('Dev AppStore')).toBe(true);
    expect(m.html).toContain('https://devappstore.test/account/purchases');

    expect(await sendWithdrawalAcknowledgement(orderId, deps())).toEqual({ ok: true, status: 'skipped', reason: 'already_sent' });
    expect(outbox).toHaveLength(1);
    const rows = await database.select().from(notificationsSent).where(eq(notificationsSent.refId, orderId));
    expect(rows).toMatchObject([{ kind: 'withdrawal_acknowledgement', status: 'sent' }]);
  });

  it('un échec d’envoi ne lève pas et peut être retenté', async () => {
    const orderId = await makeOrder();
    await database.update(orders).set({ status: 'refunded', refundedAt: NOW }).where(eq(orders.id, orderId));
    failNext = 1;
    expect((await sendWithdrawalAcknowledgement(orderId, deps())).ok).toBe(false);
    expect(await sendWithdrawalAcknowledgement(orderId, deps())).toMatchObject({ ok: true, status: 'sent' });
    expect(outbox[0]!.text).toContain('simulé'); // commande sans paiement Stripe : mode simulation
  });
});

describe('sendPurchaseReceipt', () => {
  it('envoie le reçu une seule fois, avec le compte de jeu et la renonciation', async () => {
    const orderId = await makeOrder();
    const r1 = await sendPurchaseReceipt(orderId, deps());
    expect(r1).toEqual({ ok: true, status: 'sent', recipients: ['lea@test.dev'] });
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe('lea@test.dev');
    expect(outbox[0].text).toContain('DragonSlayer');
    expect(outbox[0].text).toContain(orderId);
    expect(outbox[0].html).toContain('https://devappstore.test/account/purchases');

    const r2 = await sendPurchaseReceipt(orderId, deps());
    expect(r2).toEqual({ ok: true, status: 'skipped', reason: 'already_sent' });
    expect(outbox).toHaveLength(1);
    const rows = await database.select().from(notificationsSent).where(eq(notificationsSent.refId, orderId));
    expect(rows).toMatchObject([{ kind: 'purchase_receipt', status: 'sent', recipient: 'lea@test.dev', providerId: 'mem_1' }]);
  });

  it('ne réserve rien pour une commande non payée (un appel ultérieur enverra)', async () => {
    const orderId = await makeOrder({ status: 'pending' });
    expect(await sendPurchaseReceipt(orderId, deps())).toEqual({ ok: true, status: 'skipped', reason: 'not_paid' });
    expect(await database.select().from(notificationsSent).where(eq(notificationsSent.refId, orderId))).toHaveLength(0);
    expect(await sendPurchaseReceipt('ord_inconnue', deps())).toEqual({ ok: true, status: 'skipped', reason: 'not_found' });
  });

  it('une erreur du transport ne lève pas, est journalisée et peut être retentée', async () => {
    const orderId = await makeOrder();
    failNext = 1;
    const r1 = await sendPurchaseReceipt(orderId, deps());
    expect(r1.ok).toBe(false);
    expect(logs.join('\n')).toContain('purchase_receipt');
    const [row] = await database.select().from(notificationsSent).where(eq(notificationsSent.refId, orderId));
    expect(row.status).toBe('failed');

    const r2 = await sendPurchaseReceipt(orderId, deps());
    expect(r2).toMatchObject({ ok: true, status: 'sent' });
    const [after] = await database.select().from(notificationsSent).where(eq(notificationsSent.refId, orderId));
    expect(after).toMatchObject({ status: 'sent', attempts: 2, error: null });
  });

  it('une erreur de base ne lève pas non plus', async () => {
    const broken = { select: () => { throw new Error('connexion perdue'); } } as unknown as DB;
    const r = await sendPurchaseReceipt('ord_x', deps({ database: broken }));
    expect(r).toEqual({ ok: false, error: 'connexion perdue' });
  });

  it('deux appels concurrents n’envoient qu’un e-mail', async () => {
    const orderId = await makeOrder();
    const results = await Promise.all([sendPurchaseReceipt(orderId, deps()), sendPurchaseReceipt(orderId, deps())]);
    expect(outbox).toHaveLength(1);
    expect(results.map((r) => (r.ok ? r.status : 'error')).sort()).toEqual(['sent', 'skipped']);
  });
});

describe('sendPurchaseDelivered', () => {
  it('attend que la livraison soit terminée', async () => {
    const orderId = await makeOrder();
    const id = await makeDelivery(orderId, 'pending');
    expect(await sendPurchaseDelivered(id, deps())).toEqual({ ok: true, status: 'skipped', reason: 'not_delivered' });
    await database.update(deliveries).set({ status: 'delivered', deliveredAt: NOW }).where(eq(deliveries.id, id));
    expect(await sendPurchaseDelivered(id, deps())).toMatchObject({ ok: true, status: 'sent' });
    expect(await sendPurchaseDelivered(id, deps())).toMatchObject({ status: 'skipped', reason: 'already_sent' });
    expect(outbox).toHaveLength(1);
    expect(outbox[0].text).toContain('Crystal Quest');
  });
});

describe('sendDeliveryFailed', () => {
  it('prévient le joueur et envoie une alerte studio regroupée par jeu et par heure', async () => {
    const o1 = await makeOrder();
    const o2 = await makeOrder({ title: 'Pack <script>' });
    const d1 = await makeDelivery(o1, 'failed');
    const d2 = await makeDelivery(o2, 'failed');
    await database.insert(webhookAttempts).values({ id: 'wha_1', deliveryId: d1, url: 'https://game.test/hook', statusCode: 503, createdAt: NOW });

    const r1 = await sendDeliveryFailed(d1, deps());
    expect(r1.ok).toBe(true);
    expect(r1.player).toMatchObject({ status: 'sent', recipients: ['lea@test.dev'] });
    // owner + developer, pas finance
    expect(r1.studio).toMatchObject({ status: 'sent' });
    expect(r1.studio.ok && r1.studio.status === 'sent' && r1.studio.recipients.sort()).toEqual(['dev@studio.dev', 'owner@studio.dev']);
    const alert = outbox.find((m) => m.to === 'owner@studio.dev')!;
    expect(alert.subject).toContain('Crystal Quest');
    expect(alert.html).toContain('https://devappstore.test/studio/games/gam_a/integration');
    expect(alert.html).toContain(o2);
    expect(alert.html).not.toContain('<script>');

    // Seconde livraison en échec dans la même heure : e-mail joueur, mais pas de nouvelle alerte.
    const r2 = await sendDeliveryFailed(d2, deps({ now: new Date(NOW.getTime() + 20 * 60_000) }));
    expect(r2.player).toMatchObject({ status: 'sent' });
    expect(r2.studio).toEqual({ ok: true, status: 'skipped', reason: 'already_sent' });

    // L'heure suivante : nouvelle alerte possible.
    const r3 = await sendDeliveryFailed(d2, deps({ now: new Date(NOW.getTime() + 61 * 60_000) }));
    expect(r3.player).toMatchObject({ status: 'skipped', reason: 'already_sent' });
    expect(r3.studio).toMatchObject({ status: 'sent' });
  });

  it('ignore une livraison qui n’est pas en échec', async () => {
    const id = await makeDelivery(await makeOrder({ gameId: 'gam_b' }), 'delivered', 'gam_b');
    const r = await sendDeliveryFailed(id, deps());
    expect(r.player).toEqual({ ok: true, status: 'skipped', reason: 'not_failed' });
    expect(r.studio).toEqual({ ok: true, status: 'skipped', reason: 'not_failed' });
    expect(outbox).toHaveLength(0);
  });
});

describe('bienvenue', () => {
  it('joueur et studio, une seule fois', async () => {
    expect(await sendPlayerWelcome('usr_p', deps())).toMatchObject({ status: 'sent', recipients: ['lea@test.dev'] });
    expect(await sendPlayerWelcome('usr_p', deps())).toMatchObject({ status: 'skipped', reason: 'already_sent' });
    expect(await sendStudioWelcome('std_n', deps())).toMatchObject({ status: 'sent', recipients: ['owner@studio.dev'] });
    expect(await sendStudioWelcome('std_n', deps())).toMatchObject({ status: 'skipped' });
    expect(outbox).toHaveLength(2);
    expect(outbox[1].text).toContain('Nova <Games>');
    expect(outbox[1].html).not.toContain('Nova <Games>');
  });
});

describe('rapport hebdomadaire', () => {
  it('calcule les semaines en UTC', () => {
    expect(startOfWeekUtc(new Date('2026-11-15T23:00:00Z')).toISOString()).toBe('2026-11-09T00:00:00.000Z');
    expect(previousWeekStart(NOW).toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });

  it('agrège les ventes de la semaine et de la précédente, puis envoie une fois', async () => {
    const week = new Date('2026-10-26T00:00:00Z');
    await makeOrder({ paidAt: new Date('2026-10-27T12:00:00Z'), amountCents: 1000, title: 'Coffre' });
    await makeOrder({ paidAt: new Date('2026-10-28T12:00:00Z'), amountCents: 1000, title: 'Coffre' });
    await makeOrder({ paidAt: new Date('2026-11-01T22:00:00Z'), amountCents: 500, gameId: 'gam_b' });
    await makeOrder({ paidAt: new Date('2026-10-20T12:00:00Z'), amountCents: 800 }); // semaine précédente
    await makeOrder({ paidAt: new Date('2026-11-02T00:00:00Z'), amountCents: 9999 }); // semaine suivante

    const sales = await computeWeeklySales('std_n', week, database);
    expect(sales.orders).toBe(3);
    expect(sales.currency).toBe('EUR');
    const a = sales.games.find((g) => g.name === 'Crystal Quest')!;
    expect(a).toMatchObject({ revenueCents: 2000, orders: 2, previousRevenueCents: 800, platformFeeBps: 500 });
    expect(sales.topItem).toEqual({ name: 'Coffre', gameName: 'Crystal Quest', orders: 2 });

    const r = await sendWeeklyStudioReport('std_n', new Date('2026-10-29T08:00:00Z'), deps());
    expect(r.ok && r.status === 'sent' && r.recipients.sort()).toEqual(['fin@studio.dev', 'owner@studio.dev']);
    expect(outbox[0].subject).toContain('25,00');
    expect(await sendWeeklyStudioReport('std_n', week, deps())).toMatchObject({ status: 'skipped', reason: 'already_sent' });
    const [row] = await database.select().from(notificationsSent).where(eq(notificationsSent.kind, 'studio_weekly_report'));
    expect(row.refId).toBe('std_n:2026-10-26');
  });

  it('ne rapporte ni une semaine en cours ni une semaine sans activité', async () => {
    expect(await sendWeeklyStudioReport('std_n', NOW, deps())).toMatchObject({ status: 'skipped', reason: 'no_activity' });
    expect(await sendWeeklyStudioReport('std_n', new Date('2025-01-06T00:00:00Z'), deps())).toMatchObject({ status: 'skipped', reason: 'no_activity' });
  });

  it('sendAllWeeklyReports parcourt les studios', async () => {
    const run = await sendAllWeeklyReports(new Date('2026-10-19T00:00:00Z'), deps());
    expect(run).toMatchObject({ weekStart: '2026-10-19', studios: 1, sent: 1, failed: 0 });
  });
});
