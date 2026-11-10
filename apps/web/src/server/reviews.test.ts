import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME } from '@devappstore/core';
import { createTestDb } from '@devappstore/db/testing';
import type { DB } from '@devappstore/db';

/*
 * Avis des joueurs : base en mémoire, session simulée. Couvre l'écriture (connexion, e-mail vérifié, jeu en ligne,
 * un avis par compte et par jeu, modification, suppression, limitation de débit), la lecture (synthèse, pagination,
 * avis masqués exclus), `getRatingsSummary` et la modération (accès, journal d'audit).
 */

const h = vi.hoisted(() => ({
  db: null as unknown as DB,
  current: null as null | { id: string; email: string; name: string },
}));

vi.mock('@devappstore/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@devappstore/db')>();
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

vi.mock('./session', () => ({
  getCurrentUser: async () => h.current,
  ADMIN_RECENT_LOGIN_MS: 12 * 60 * 60_000,
  requireRecentLogin: async () => h.current,
}));

vi.mock('./delivery', () => ({ dispatchDelivery: vi.fn() }));

const reviews = await import('./reviews');
const { MemoryRateLimitStore } = await import('./rate-limit');
const { REVIEW_LIMITS } = await import('./reviews-logic');
const { adminAuditLog, eq, gameReviews, games, platformAdmins, studios, user } = await import('@devappstore/db');

const U = {
  admin: { id: 'usr_admin', email: 'admin@devappstore.test', name: 'Admin', emailVerified: true },
  finance: { id: 'usr_fin', email: 'finance@devappstore.test', name: 'Finance', emailVerified: true },
  alice: { id: 'usr_alice', email: 'alice@exemple.test', name: 'Alice Martin', emailVerified: true },
  bob: { id: 'usr_bob', email: 'bob@exemple.test', name: 'Bob Durand', emailVerified: true },
  newbie: { id: 'usr_new', email: 'new@exemple.test', name: 'Nouveau Venu', emailVerified: false },
};

let store = new MemoryRateLimitStore();
const ctx = (u: { id: string; name: string } | null, extra: Partial<Parameters<typeof reviews.submitReview>[2]> = {}) => ({ user: u, ip: '10.0.0.1', store, ...extra });
const body = 'Très bon jeu, les combats sont nerveux et la boutique est honnête.';

beforeAll(async () => {
  h.db = await createTestDb();
  await h.db.insert(user).values(Object.values(U));
  await h.db.insert(platformAdmins).values([
    { userId: U.admin.id, role: 'superadmin' },
    { userId: U.finance.id, role: 'finance' },
  ]);
  await h.db.insert(studios).values({ id: 'std_t', name: 'Studio Test', slug: 'studio-test' });
  const base = { studioId: 'std_t', theme: DEFAULT_THEME, webhookSecret: 'whsec', apiKeyHash: 'hash', apiKeyPrefix: 'das_test' };
  await h.db.insert(games).values([
    { ...base, id: 'gam_live', slug: 'jeu-live', name: 'Jeu Live', status: 'live' },
    { ...base, id: 'gam_list', slug: 'jeu-liste', name: 'Jeu Liste', status: 'live' },
    { ...base, id: 'gam_draft', slug: 'jeu-brouillon', name: 'Jeu Brouillon', status: 'draft' },
  ]);
  // 23 avis de démo sur gam_list (sans compte), dont un masqué.
  const t0 = new Date('2026-10-01T00:00:00Z').getTime();
  await h.db.insert(gameReviews).values(
    Array.from({ length: 23 }, (_, i) => ({
      id: `rev_l_${String(i).padStart(2, '0')}`,
      gameId: 'gam_list',
      authorName: `Auteur ${i}`,
      rating: (i % 5) + 1,
      body: `Avis numéro ${i} assez long.`,
      status: i === 22 ? ('hidden' as const) : ('visible' as const),
      createdAt: new Date(t0 + i * 3600_000),
      updatedAt: new Date(t0 + i * 3600_000),
    })),
  );
});

beforeEach(() => {
  h.current = null;
  store = new MemoryRateLimitStore();
});

describe('submitReview', () => {
  it('refuse un visiteur non connecté et un compte non vérifié', async () => {
    expect(await reviews.submitReview('jeu-live', { rating: 5, body }, ctx(null))).toMatchObject({ ok: false, error: 'unauthenticated' });
    expect(await reviews.submitReview('jeu-live', { rating: 5, body }, ctx(U.newbie))).toMatchObject({ ok: false, error: 'email_not_verified' });
  });

  it('refuse une saisie invalide et un jeu qui n’est pas en ligne', async () => {
    expect(await reviews.submitReview('jeu-live', { rating: 0, body }, ctx(U.alice))).toMatchObject({ ok: false, error: 'invalid' });
    expect(await reviews.submitReview('jeu-live', { rating: 4, body: 'court' }, ctx(U.alice))).toMatchObject({ ok: false, error: 'invalid' });
    expect(await reviews.submitReview('jeu-brouillon', { rating: 4, body }, ctx(U.alice))).toMatchObject({ ok: false, error: 'not_found' });
    expect(await reviews.submitReview('inconnu', { rating: 4, body }, ctx(U.alice))).toMatchObject({ ok: false, error: 'not_found' });
  });

  it('crée puis modifie l’unique avis du compte (nom public « Alice M. »)', async () => {
    const a = await reviews.submitReview('jeu-live', { rating: 5, body }, ctx(U.alice));
    expect(a).toMatchObject({ ok: true, created: true, hidden: false });
    const b = await reviews.submitReview('jeu-live', { rating: '3', body: 'Finalement un peu répétitif.' }, ctx(U.alice, { now: new Date(Date.now() + 120_000) }));
    expect(b).toMatchObject({ ok: true, created: false });
    if (!a.ok || !b.ok) return;
    expect(b.reviewId).toBe(a.reviewId);
    const rows = await h.db.select().from(gameReviews).where(eq(gameReviews.gameId, 'gam_live'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: U.alice.id, authorName: 'Alice M.', rating: 3, body: 'Finalement un peu répétitif.' });
    const mine = await reviews.getMyReview('gam_live', U.alice.id);
    expect(mine).toMatchObject({ rating: 3, status: 'visible' });
    const page = await reviews.listGameReviews('gam_live', 1, U.alice.id);
    expect(page.reviews[0]).toMatchObject({ mine: true, edited: true });
  });

  it('limite le débit des envois par compte', async () => {
    for (let i = 0; i < REVIEW_LIMITS.perUserBurst.max; i++) {
      expect((await reviews.submitReview('jeu-live', { rating: 4, body }, ctx(U.bob))).ok).toBe(true);
    }
    expect(await reviews.submitReview('jeu-live', { rating: 4, body }, ctx(U.bob))).toMatchObject({ ok: false, error: 'rate_limited' });
  });

  it('supprime l’avis du compte (et seulement le sien)', async () => {
    await reviews.submitReview('jeu-live', { rating: 2, body }, ctx(U.bob));
    expect(await reviews.deleteMyReview('jeu-live', ctx(null))).toMatchObject({ ok: false, error: 'unauthenticated' });
    expect(await reviews.deleteMyReview('jeu-live', ctx(U.bob))).toEqual({ ok: true, deleted: true });
    expect(await reviews.deleteMyReview('jeu-live', ctx(U.bob))).toEqual({ ok: true, deleted: false });
    expect(await reviews.getMyReview('gam_live', U.alice.id)).not.toBeNull();
  });
});

describe('lecture', () => {
  it('pagine les avis visibles, plus récents d’abord, 10 par page', async () => {
    const p1 = await reviews.listGameReviews('gam_list', 1);
    expect(p1).toMatchObject({ page: 1, totalPages: 3, total: 22 });
    expect(p1.reviews).toHaveLength(10);
    expect(p1.reviews[0]!.id).toBe('rev_l_21'); // rev_l_22 est masqué
    const p3 = await reviews.listGameReviews('gam_list', 3);
    expect(p3.reviews.map((r) => r.id)).toEqual(['rev_l_01', 'rev_l_00']);
    expect((await reviews.listGameReviews('gam_list', 99)).page).toBe(3);
  });

  it('répartition et synthèse multi-jeux (avis masqués exclus, jeux sans avis à 0)', async () => {
    const b = await reviews.getRatingBreakdown('gam_list');
    expect(b.count).toBe(22);
    expect(b.distribution).toEqual({ 1: 5, 2: 5, 3: 4, 4: 4, 5: 4 });
    const s = await reviews.getRatingsSummary(['gam_list', 'gam_draft', 'gam_list']);
    expect(s.get('gam_list')).toEqual({ average: b.average, count: 22 });
    expect(s.get('gam_draft')).toEqual({ average: 0, count: 0 });
    expect((await reviews.getRatingsSummary([])).size).toBe(0);
  });
});

describe('modération', () => {
  it('404 pour un non-administrateur ou un rôle sans la permission', async () => {
    h.current = U.alice;
    await expect(reviews.setReviewStatus('rev_l_00', { status: 'hidden' })).rejects.toThrow('NEXT_NOT_FOUND');
    h.current = U.finance;
    await expect(reviews.listReviewsForAdmin({})).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('masque puis réaffiche un avis, journalisé à chaque changement', async () => {
    h.current = U.admin;
    expect(await reviews.setReviewStatus('rev_l_05', { status: 'hidden', reason: 'Insultes' })).toEqual({ status: 'hidden', changed: true });
    expect(await reviews.setReviewStatus('rev_l_05', { status: 'hidden' })).toEqual({ status: 'hidden', changed: false });
    expect((await reviews.getRatingBreakdown('gam_list')).count).toBe(21);
    const listed = await reviews.listReviewsForAdmin({ status: 'hidden' });
    expect(listed.rows.map((r) => r.id).sort()).toEqual(['rev_l_05', 'rev_l_22']);
    expect(await reviews.setReviewStatus('rev_l_05', { status: 'visible' })).toEqual({ status: 'visible', changed: true });
    const audit = await h.db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, 'gam_list'));
    expect(audit.map((a) => a.action)).toEqual(['review.hide', 'review.show']);
    expect(audit[0]).toMatchObject({ adminId: U.admin.id, targetType: 'game', details: { reviewId: 'rev_l_05', reason: 'Insultes', previousStatus: 'visible' } });
    await expect(reviews.setReviewStatus('rev_inconnu', { status: 'hidden' })).rejects.toThrow('introuvable');
    await expect(reviews.setReviewStatus('rev_l_05', { status: 'supprimé' })).rejects.toThrow('Statut inconnu');
  });

  it('un avis masqué reste masqué quand son auteur le modifie', async () => {
    const r = await reviews.submitReview('jeu-liste', { rating: 1, body: 'Avis à modérer, vraiment pas sympa.' }, ctx(U.bob));
    if (!r.ok) throw new Error(r.message);
    h.current = U.admin;
    await reviews.setReviewStatus(r.reviewId, { status: 'hidden' });
    const again = await reviews.submitReview('jeu-liste', { rating: 2, body: 'Avis modifié, toujours masqué.' }, ctx(U.bob));
    expect(again).toMatchObject({ ok: true, created: false, hidden: true });
  });

  it('recherche par jeu, auteur ou texte', async () => {
    h.current = U.admin;
    const r = await reviews.listReviewsForAdmin({ q: 'numéro 7' });
    expect(r.rows.map((x) => x.id)).toEqual(['rev_l_07']);
    expect((await reviews.listReviewsForAdmin({ q: '100%_' })).rows).toHaveLength(0);
  });
});
