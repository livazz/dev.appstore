import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ITEM_STYLE, DEFAULT_THEME } from '@wolleen/core';
import { createTestDb } from '@wolleen/db/testing';
import type { DB } from '@wolleen/db';
import type { Mailer, MailMessage } from '@wolleen/emails';

/*
 * Back-office : base en mémoire, session simulée (utilisateur « connecté » courant), delivery.ts simulé
 * (on vérifie l'appel à dispatchDelivery, pas l'envoi HTTP), notFound() de Next remplacé par une erreur repérable.
 */

const h = vi.hoisted(() => ({
  db: null as unknown as DB,
  current: null as null | { id: string; email: string; name: string },
  dispatched: [] as string[],
}));

vi.mock('@wolleen/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wolleen/db')>();
  return {
    ...actual,
    get db() {
      return h.db;
    },
  };
});

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('./session', () => ({ getCurrentUser: async () => h.current }));

vi.mock('./delivery', async () => {
  const { deliveries, eq } = await import('@wolleen/db');
  return {
    dispatchDelivery: vi.fn(async (id: string) => {
      h.dispatched.push(id);
      await h.db.update(deliveries).set({ status: 'delivered', attempts: 9, lastError: null, deliveredAt: new Date() }).where(eq(deliveries.id, id));
    }),
  };
});

const admin = await import('./admin');
const { adminAuditLog, deliveries, eq, gameModerationNotices, games, items, orders, platformAdmins, session, studioMembers, studios, user, userSuspensions } =
  await import('@wolleen/db');

const U = {
  super: { id: 'usr_super', email: 'super@devappstore.test', name: 'Super' },
  support: { id: 'usr_support', email: 'support@devappstore.test', name: 'Support' },
  finance: { id: 'usr_finance', email: 'finance@devappstore.test', name: 'Finance' },
  owner: { id: 'usr_owner', email: 'owner@studio.test', name: 'Owner' },
  dev: { id: 'usr_devm', email: 'dev@studio.test', name: 'Dev' },
  player: { id: 'usr_player', email: 'joueur@exemple.test', name: 'Joueur' },
  disabledAdmin: { id: 'usr_gone', email: 'gone@devappstore.test', name: 'Parti' },
};

function sentMailer() {
  const sent: MailMessage[] = [];
  const mailer: Mailer = { send: async (m) => (sent.push(m), { id: `m${sent.length}` }) };
  return { sent, mailer };
}

const login = (u: { id: string; email: string; name: string } | null) => {
  h.current = u;
};

async function auditFor(targetId: string) {
  return h.db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, targetId));
}

async function setGameStatus(id: string, status: 'draft' | 'review' | 'live' | 'suspended') {
  await h.db.update(games).set({ status }).where(eq(games.id, id));
}

beforeAll(async () => {
  h.db = await createTestDb();
  await h.db.insert(user).values(Object.values(U));
  await h.db.insert(platformAdmins).values([
    { userId: U.super.id, role: 'superadmin' },
    { userId: U.support.id, role: 'support' },
    { userId: U.finance.id, role: 'finance' },
    { userId: U.disabledAdmin.id, role: 'superadmin' },
  ]);
  await h.db.insert(userSuspensions).values({ userId: U.disabledAdmin.id, adminId: U.super.id, reason: 'Départ de l’équipe Dev AppStore.' });
  await h.db.insert(studios).values({ id: 'std_t', name: 'Studio Test', slug: 'studio-test' });
  await h.db.insert(studioMembers).values([
    { studioId: 'std_t', userId: U.owner.id, role: 'owner' },
    { studioId: 'std_t', userId: U.dev.id, role: 'developer' },
  ]);
  const base = { studioId: 'std_t', theme: DEFAULT_THEME, webhookSecret: 'whsec_secret', apiKeyHash: 'hash', apiKeyPrefix: 'wk_test' };
  await h.db.insert(games).values([
    { ...base, id: 'gam_a', slug: 'jeu-a', name: 'Jeu A', status: 'review' },
    { ...base, id: 'gam_b', slug: 'jeu-b', name: 'Jeu B', status: 'live' },
  ]);
  await h.db.insert(items).values({ id: 'itm_a', gameId: 'gam_a', productId: 'gems', title: 'Gemmes', priceCents: 499, style: DEFAULT_ITEM_STYLE });
  const now = new Date();
  await h.db.insert(orders).values([
    { id: 'ord_fail', userId: U.player.id, gameId: 'gam_a', itemId: 'itm_a', productId: 'gems', itemTitle: 'Gemmes', playerId: 'P-1', amountCents: 1000, platformFeeCents: 50, currency: 'EUR', status: 'paid', paidAt: now },
    { id: 'ord_ok', userId: U.player.id, gameId: 'gam_a', itemId: 'itm_a', productId: 'gems', itemTitle: 'Gemmes', playerId: 'P-2', amountCents: 2000, platformFeeCents: 100, currency: 'EUR', status: 'paid', paidAt: now },
    { id: 'ord_old', userId: U.player.id, gameId: 'gam_a', itemId: 'itm_a', productId: 'gems', itemTitle: 'Gemmes', playerId: 'P-3', amountCents: 9000, platformFeeCents: 450, currency: 'EUR', status: 'paid', paidAt: new Date(now.getTime() - 20 * 86_400_000) },
    { id: 'ord_pending', userId: U.player.id, gameId: 'gam_a', itemId: 'itm_a', productId: 'gems', itemTitle: 'Gemmes', playerId: 'P-4', amountCents: 500, platformFeeCents: 25, currency: 'EUR', status: 'pending' },
  ]);
  const payload = (id: string, orderId: string) => ({
    event: 'purchase.completed' as const,
    delivery_id: id,
    order_id: orderId,
    game_id: 'gam_a',
    player_id: 'P-1',
    product_id: 'gems',
    item_type: 'consumable' as const,
    quantity: 1,
    amount_cents: 1000,
    currency: 'EUR' as const,
    created_at: now.toISOString(),
  });
  await h.db.insert(deliveries).values([
    { id: 'dlv_fail', orderId: 'ord_fail', gameId: 'gam_a', playerId: 'P-1', payload: payload('dlv_fail', 'ord_fail'), status: 'failed', attempts: 8, lastError: 'HTTP 500' },
    { id: 'dlv_ok', orderId: 'ord_ok', gameId: 'gam_a', playerId: 'P-2', payload: payload('dlv_ok', 'ord_ok'), status: 'acknowledged', attempts: 1 },
  ]);
});

beforeEach(() => {
  login(U.super);
  h.dispatched = [];
});

describe('requirePlatformAdmin — accès', () => {
  it('répond 404 (et non 403) aux visiteurs, aux non-admins et aux admins désactivés', async () => {
    for (const u of [null, U.player, U.owner, U.disabledAdmin]) {
      login(u);
      await expect(admin.requirePlatformAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
    }
  });

  it('répond 404 quand le rôle ne fait pas partie des rôles exigés', async () => {
    login(U.finance);
    await expect(admin.requirePlatformAdmin(['superadmin', 'support'])).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(admin.requireAdminPermission('games.moderate')).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(admin.requireAdminPermission('dashboard.read')).resolves.toMatchObject({ role: 'finance' });
  });

  it('renvoie le contexte administrateur', async () => {
    login(U.support);
    await expect(admin.requirePlatformAdmin()).resolves.toEqual({ user: U.support, role: 'support' });
  });

  it('refuse toutes les actions aux non-admins, sans rien modifier ni journaliser', async () => {
    const before = (await h.db.select().from(adminAuditLog)).length;
    for (const u of [null, U.player, U.owner]) {
      login(u);
      await expect(admin.approveGame('gam_a')).rejects.toThrow('NEXT_NOT_FOUND');
      await expect(admin.suspendGame('gam_b', { ground: 'fraud', reason: 'Paiements frauduleux constatés sur 40 commandes.' })).rejects.toThrow('NEXT_NOT_FOUND');
      await expect(admin.reactivateGame('gam_b')).rejects.toThrow('NEXT_NOT_FOUND');
      await expect(admin.retryOrderDelivery('ord_fail')).rejects.toThrow('NEXT_NOT_FOUND');
      await expect(admin.disableUser(U.player.id, { reason: 'Fraude à la carte bancaire avérée.' })).rejects.toThrow('NEXT_NOT_FOUND');
      await expect(admin.enableUser(U.disabledAdmin.id)).rejects.toThrow('NEXT_NOT_FOUND');
    }
    // La finance consulte mais n'agit pas.
    login(U.finance);
    await expect(admin.approveGame('gam_a')).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(admin.retryOrderDelivery('ord_fail')).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(admin.disableUser(U.player.id, { reason: 'Fraude à la carte bancaire avérée.' })).rejects.toThrow('NEXT_NOT_FOUND');

    expect((await h.db.select().from(adminAuditLog)).length).toBe(before);
    const [a] = await h.db.select({ status: games.status }).from(games).where(eq(games.id, 'gam_a'));
    expect(a!.status).toBe('review');
    expect(h.dispatched).toEqual([]);
  });
});

describe('modération des jeux', () => {
  it('approuve un jeu en revue → live, journalise et prévient le studio', async () => {
    const { sent, mailer } = sentMailer();
    const r = await admin.approveGame('gam_a', undefined, { mailer });
    expect(r).toMatchObject({ status: 'live', notified: true });
    const [g] = await h.db.select({ status: games.status }).from(games).where(eq(games.id, 'gam_a'));
    expect(g!.status).toBe('live');
    const log = await auditFor('gam_a');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ adminId: U.super.id, action: 'game.approve', targetType: 'game', details: { from: 'review', to: 'live', noticeId: r.noticeId } });
    expect(sent.map((m) => m.to)).toEqual([U.owner.email]); // propriétaire/admin du studio uniquement
    expect(sent[0]!.subject).toContain('Dev AppStore');
    await expect(admin.approveGame('gam_a', undefined, { mailer })).rejects.toThrow('Seul un jeu en revue');
  });

  it('refuse une suspension sans motif (ni modification ni journal)', async () => {
    const before = (await auditFor('gam_b')).length;
    await expect(admin.suspendGame('gam_b', { ground: 'fraud', reason: '' })).rejects.toThrow('Le motif est obligatoire.');
    await expect(admin.suspendGame('gam_b', { ground: 'fraud', reason: '   ' })).rejects.toThrow('Le motif est obligatoire.');
    await expect(admin.suspendGame('gam_b', { ground: 'fraud' } as never)).rejects.toThrow('Le motif est obligatoire.');
    await expect(admin.suspendGame('gam_b', undefined as never)).rejects.toThrow(admin.AdminError);
    await expect(admin.suspendGame('gam_b', { ground: 'fraud', reason: 'trop court' })).rejects.toThrow('au moins 20 caractères');
    await expect(admin.suspendGame('gam_b', { reason: 'Paiements frauduleux constatés sur 40 commandes.' } as never)).rejects.toThrow('fondement');
    const [g] = await h.db.select({ status: games.status }).from(games).where(eq(games.id, 'gam_b'));
    expect(g!.status).toBe('live');
    expect(await auditFor('gam_b')).toHaveLength(before);
    expect(await h.db.select().from(gameModerationNotices).where(eq(gameModerationNotices.gameId, 'gam_b'))).toHaveLength(0);
  });

  it('suspend avec motif : statut, notification P2B au studio (motif + voie de contestation), journal', async () => {
    login(U.support);
    const { sent, mailer } = sentMailer();
    const reason = 'Paiements frauduleux constatés sur 40 commandes du 2 au 5 novembre.';
    const r = await admin.suspendGame('gam_b', { ground: 'fraud', reason: `  ${reason}  ` }, { mailer });
    expect(r.status).toBe('suspended');
    const [n] = await h.db.select().from(gameModerationNotices).where(eq(gameModerationNotices.id, r.noticeId));
    expect(n).toMatchObject({ action: 'suspend', fromStatus: 'live', toStatus: 'suspended', ground: 'fraud', reason, adminId: U.support.id, notifiedTo: U.owner.email });
    expect(n!.notifiedAt).toBeInstanceOf(Date);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain(reason);
    expect(sent[0]!.text).toContain('Fraude ou paiements suspects');
    expect(sent[0]!.text).toContain('contester');
    expect(sent[0]!.html).toContain(r.noticeId);
    const log = await auditFor('gam_b');
    expect(log.at(-1)).toMatchObject({ adminId: U.support.id, action: 'game.suspend', details: { from: 'live', to: 'suspended', ground: 'fraud', reason } });
    await expect(admin.suspendGame('gam_b', { ground: 'fraud', reason })).rejects.toThrow('déjà suspendu');
  });

  it('une panne d’e-mail n’annule pas la décision (erreur notée sur la notification)', async () => {
    const failing: Mailer = { send: async () => Promise.reject(new Error('SMTP indisponible')) };
    const r = await admin.reactivateGame('gam_b', 'Remboursements effectués par le studio.', { mailer: failing });
    expect(r).toMatchObject({ status: 'live', notified: false });
    const [n] = await h.db.select().from(gameModerationNotices).where(eq(gameModerationNotices.id, r.noticeId));
    expect(n).toMatchObject({ action: 'reactivate', toStatus: 'live', notifyError: 'SMTP indisponible', reason: 'Remboursements effectués par le studio.' });
    expect((await auditFor('gam_b')).at(-1)).toMatchObject({ action: 'game.reactivate', details: { from: 'suspended', to: 'live' } });
    await expect(admin.reactivateGame('gam_b')).rejects.toThrow('Seul un jeu suspendu');
  });

  it('un jeu inconnu est une erreur métier, sans journal', async () => {
    await expect(admin.approveGame('gam_nope')).rejects.toThrow('Jeu introuvable.');
    expect(await auditFor('gam_nope')).toHaveLength(0);
  });
});

describe('relance de livraison', () => {
  it('remet la livraison en file, appelle dispatchDelivery et journalise', async () => {
    login(U.support);
    const r = await admin.retryOrderDelivery('ord_fail');
    expect(h.dispatched).toEqual(['dlv_fail']);
    expect(r).toMatchObject({ deliveryId: 'dlv_fail', status: 'delivered' });
    const log = await auditFor('ord_fail');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ adminId: U.support.id, action: 'order.retry_delivery', targetType: 'order', details: { deliveryId: 'dlv_fail', previousStatus: 'failed', attempts: 8, lastError: 'HTTP 500' } });
  });

  it('refuse de relancer une livraison aboutie ou absente (sans journal)', async () => {
    await expect(admin.retryOrderDelivery('ord_ok')).rejects.toThrow('déjà abouti');
    await expect(admin.retryOrderDelivery('ord_pending')).rejects.toThrow('Aucune livraison');
    expect(await auditFor('ord_ok')).toHaveLength(0);
    expect(await auditFor('ord_pending')).toHaveLength(0);
    expect(h.dispatched).toEqual([]);
  });
});

describe('désactivation des comptes', () => {
  it('désactive avec motif : sessions révoquées, journal ; puis réactive', async () => {
    await h.db.insert(session).values([
      { id: 'ses_1', token: 't1', userId: U.player.id, expiresAt: new Date(Date.now() + 86_400_000) },
      { id: 'ses_2', token: 't2', userId: U.player.id, expiresAt: new Date(Date.now() + 86_400_000) },
    ]);
    await expect(admin.disableUser(U.player.id, { reason: '' })).rejects.toThrow('Le motif est obligatoire.');
    const r = await admin.disableUser(U.player.id, { reason: 'Fraude à la carte bancaire avérée (3 litiges).' });
    expect(r.revokedSessions).toBe(2);
    expect(await h.db.select().from(session).where(eq(session.userId, U.player.id))).toHaveLength(0);
    const [s] = await h.db.select().from(userSuspensions).where(eq(userSuspensions.userId, U.player.id));
    expect(s).toMatchObject({ adminId: U.super.id, reason: 'Fraude à la carte bancaire avérée (3 litiges).' });
    await expect(admin.disableUser(U.player.id, { reason: 'Fraude à la carte bancaire avérée (3 litiges).' })).rejects.toThrow('déjà désactivé');

    await admin.enableUser(U.player.id, 'Litiges clos en faveur du joueur.');
    expect(await h.db.select().from(userSuspensions).where(eq(userSuspensions.userId, U.player.id))).toHaveLength(0);
    await expect(admin.enableUser(U.player.id)).rejects.toThrow('n’est pas désactivé');

    const log = await auditFor(U.player.id);
    expect(log.map((l) => l.action)).toEqual(['user.disable', 'user.enable']);
    expect(log[0]).toMatchObject({ adminId: U.super.id, targetType: 'user', details: { revokedSessions: 2 } });
    expect(log[1]).toMatchObject({ details: { previousReason: 'Fraude à la carte bancaire avérée (3 litiges).', note: 'Litiges clos en faveur du joueur.' } });
  });

  it('interdit de se désactiver soi-même, et au support de désactiver un administrateur', async () => {
    await expect(admin.disableUser(U.super.id, { reason: 'Test de désactivation de mon compte.' })).rejects.toThrow('propre compte');
    login(U.support);
    await expect(admin.disableUser(U.finance.id, { reason: 'Test de désactivation d’un administrateur.' })).rejects.toThrow('Seul un superadmin');
    expect(await auditFor(U.finance.id)).toHaveLength(0);
  });
});

describe('lectures', () => {
  it('tableau de bord : GMV, commission, commandes et livraisons en échec sur la période', async () => {
    const d7 = await admin.getDashboard(7);
    expect(d7.sales).toEqual([{ currency: 'EUR', gmvCents: 3000, feeCents: 150, orders: 2, takeRateBps: 500 }]);
    expect(d7.ordersCount).toBe(2);
    expect(d7.daily.points).toHaveLength(7);
    expect(d7.daily.points.reduce((s, p) => s + p.cents, 0)).toBe(3000);
    const d30 = await admin.getDashboard(30);
    expect(d30.sales[0]).toMatchObject({ gmvCents: 12_000, orders: 3 });
    expect(d30.topGames[0]).toMatchObject({ id: 'gam_a', gmvCents: 12_000 });
  });

  it('recherche de commandes par id, e-mail et player_id', async () => {
    expect((await admin.searchOrdersForAdmin('ord_ok')).map((o) => o.id)).toEqual(['ord_ok']);
    expect((await admin.searchOrdersForAdmin('P-3')).map((o) => o.id)).toEqual(['ord_old']);
    expect((await admin.searchOrdersForAdmin('JOUEUR@exemple')).length).toBe(4);
    expect(await admin.searchOrdersForAdmin('%')).toEqual([]);
  });

  it('fiche jeu sans secret, fiche commande avec livraison et journal', async () => {
    const g = await admin.getGameForAdmin('gam_a');
    expect(JSON.stringify(g)).not.toContain('whsec_secret');
    expect(g?.items).toHaveLength(1);
    const o = await admin.getOrderForAdmin('ord_fail');
    expect(o?.delivery?.id).toBe('dlv_fail');
    expect(o?.audit.map((a) => a.action)).toContain('order.retry_delivery');
    expect(o?.audit[0]?.adminEmail).toBe(U.support.email);
  });

  it('journal filtrable par action', async () => {
    const { rows } = await admin.listAuditEntries({ action: 'game.suspend' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.action === 'game.suspend')).toBe(true);
  });
});
