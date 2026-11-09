import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ITEM_STYLE, DEFAULT_THEME } from '@devappstore/core';
import { createTestDb } from '@devappstore/db/testing';
import type { DB } from '@devappstore/db';

/*
 * Revue de sécurité 2026-11, A-12 (CHK-MT-03) : accès croisé entre studios sur les actions sensibles qui n'avaient pas
 * de test — intégration (clés, secret webhook, URL, relance de livraison, jetons joueur), import depuis les stores,
 * versements. Ici, `requireGameAccess` et `requireRecentLogin` sont les VRAIS (session.ts) : seule la lecture de la
 * session Better Auth est simulée. A-11 : connexion récente exigée pour les versements.
 */

const h = vi.hoisted(() => ({
  db: null as unknown as DB,
  session: null as null | { user: { id: string; email: string; name: string }; session: { createdAt: Date } },
}));

vi.mock('server-only', () => ({}));
vi.mock('@devappstore/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@devappstore/db')>();
  return {
    ...actual,
    get db() {
      return h.db;
    },
  };
});
vi.mock('./auth', () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url });
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const integration = await import('@/app/studio/games/[id]/integration/actions');
const imports = await import('./import-actions');
const payouts = await import('@/app/studio/payouts/actions');
const session = await import('./session');
const { deliveries, eq, games, items, orders, playerTokens, storeCredentials, studioMembers, studios, user } = await import('@devappstore/db');

const U = {
  ownerA: { id: 'usr_owner_a', email: 'owner@a.test', name: 'Owner A' },
  financeA: { id: 'usr_fin_a', email: 'fin@a.test', name: 'Finance A' },
  evil: { id: 'usr_evil', email: 'evil@b.test', name: 'Evil' },
};

function login(u: { id: string; email: string; name: string } | null, ageMs = 60_000) {
  h.session = u ? { user: u, session: { createdAt: new Date(Date.now() - ageMs) } } : null;
}

async function gameA() {
  const [g] = await h.db.select().from(games).where(eq(games.id, 'gam_a'));
  return g!;
}

beforeAll(async () => {
  h.db = await createTestDb();
  await h.db.insert(user).values(Object.values(U));
  await h.db.insert(studios).values([
    { id: 'std_a', name: 'Studio A', slug: 'studio-a' },
    { id: 'std_b', name: 'Studio B', slug: 'studio-b' },
  ]);
  await h.db.insert(studioMembers).values([
    { studioId: 'std_a', userId: U.ownerA.id, role: 'owner' },
    { studioId: 'std_a', userId: U.financeA.id, role: 'finance' },
    { studioId: 'std_b', userId: U.evil.id, role: 'owner' },
  ]);
  const base = { theme: DEFAULT_THEME, status: 'live' as const, publishableKey: null };
  await h.db.insert(games).values([
    { ...base, id: 'gam_a', studioId: 'std_a', slug: 'jeu-a', name: 'Jeu A', webhookSecret: 'whsec_a_secret', apiKeyHash: 'hash_a', apiKeyPrefix: 'das_secret_a', webhookUrl: 'https://a.test/webhook', publishableKey: 'das_pub_a' },
    { ...base, id: 'gam_b', studioId: 'std_b', slug: 'jeu-b', name: 'Jeu B', webhookSecret: 'whsec_b', apiKeyHash: 'hash_b', apiKeyPrefix: 'das_secret_b' },
  ]);
  await h.db.insert(items).values({ id: 'itm_a', gameId: 'gam_a', productId: 'gems', title: 'Gemmes', priceCents: 499, style: DEFAULT_ITEM_STYLE });
  await h.db.insert(orders).values({ id: 'ord_a', userId: U.ownerA.id, gameId: 'gam_a', itemId: 'itm_a', productId: 'gems', itemTitle: 'Gemmes', playerId: 'P-1', amountCents: 499, platformFeeCents: 25, currency: 'EUR', status: 'paid', paidAt: new Date() });
  await h.db.insert(deliveries).values({
    id: 'dlv_a', orderId: 'ord_a', gameId: 'gam_a', playerId: 'P-1', status: 'failed', attempts: 8, lastError: 'HTTP 500',
    payload: { event: 'purchase.completed', delivery_id: 'dlv_a', order_id: 'ord_a', game_id: 'gam_a', player_id: 'P-1', product_id: 'gems', item_type: 'consumable', quantity: 1, amount_cents: 499, currency: 'EUR', created_at: new Date().toISOString() },
  });
  await h.db.insert(playerTokens).values({ id: 'ptk_a', gameId: 'gam_a', playerId: 'P-1', userId: U.ownerA.id, tokenHash: 'th_a' });
  await h.db.insert(storeCredentials).values({ id: 'stc_a', gameId: 'gam_a', source: 'app_store', ciphertext: 'c', iv: 'i', tag: 't', hint: 'KEY123' });
});

beforeEach(() => login(U.evil));

describe('A-12 : intégration du jeu d’un autre studio', () => {
  it('clés, secret webhook, URL, événement de test, relance et jetons : tout est refusé, base inchangée', async () => {
    const before = await gameA();
    for (const call of [
      () => integration.regenerateApiKey('gam_a'),
      () => integration.regeneratePublishableKey('gam_a'),
      () => integration.revealWebhookSecret('gam_a'),
      () => integration.regenerateWebhookSecret('gam_a'),
      () => integration.updateWebhookUrl('gam_a', 'https://evil.test/hook'),
      () => integration.sendTestEvent('gam_a'),
      () => integration.retryDeliveryAction('gam_a', 'dlv_a'),
      () => integration.revokePlayerTokensAction('gam_a', 'P-1'),
    ]) {
      const r = await call();
      expect(r.ok).toBe(false);
      expect(JSON.stringify(r)).not.toContain('whsec_a_secret');
    }
    const after = await gameA();
    expect(after).toMatchObject({ apiKeyHash: before.apiKeyHash, publishableKey: before.publishableKey, webhookSecret: 'whsec_a_secret', webhookUrl: 'https://a.test/webhook' });
    const [d] = await h.db.select().from(deliveries).where(eq(deliveries.id, 'dlv_a'));
    expect(d).toMatchObject({ status: 'failed', attempts: 8 });
    const [t] = await h.db.select().from(playerTokens).where(eq(playerTokens.id, 'ptk_a'));
    expect(t!.revokedAt).toBeNull();
  });

  it('CHK-MT-02 : une livraison du jeu A relancée via le jeu B (autorisé) est introuvable', async () => {
    const r = await integration.retryDeliveryAction('gam_b', 'dlv_a');
    expect(r).toEqual({ ok: false, error: 'Livraison introuvable.' });
    const [d] = await h.db.select().from(deliveries).where(eq(deliveries.id, 'dlv_a'));
    expect(d).toMatchObject({ status: 'failed', attempts: 8 });
  });

  it('le rôle finance du studio A ne modifie pas l’intégration ; un visiteur est redirigé vers la connexion', async () => {
    login(U.financeA);
    expect((await integration.regenerateWebhookSecret('gam_a')).ok).toBe(false);
    expect((await integration.revealWebhookSecret('gam_a')).ok).toBe(false);
    login(null);
    await expect(integration.regenerateApiKey('gam_a')).rejects.toMatchObject({ message: 'NEXT_REDIRECT' });
    expect((await gameA()).webhookSecret).toBe('whsec_a_secret');
  });
});

describe('A-12 : import depuis les stores pour le jeu d’un autre studio', () => {
  it('identifiants, catalogue et import : refusés, rien n’est créé ni supprimé', async () => {
    for (const call of [
      () => imports.saveStoreCredentialsAction('gam_a', 'google_play', { packageName: 'com.evil', serviceAccountJson: '{}' }),
      () => imports.deleteStoreCredentialsAction('gam_a', 'app_store'),
      () => imports.fetchCatalogAction('gam_a', { demo: true, discountBps: 1000 }),
      () => imports.repriceAction('gam_a', { discountBps: 1000, prices: [999] }),
      () => imports.importSelectionAction('gam_a', { items: [] }),
    ]) {
      expect(await call()).toEqual({ ok: false, error: "Vous n'avez pas le droit de modifier ce jeu." });
    }
    expect(await h.db.select().from(storeCredentials).where(eq(storeCredentials.gameId, 'gam_a'))).toHaveLength(1);
    expect(await h.db.select().from(items).where(eq(items.gameId, 'gam_a'))).toHaveLength(1);
  });
});

describe('A-12 / A-11 : versements', () => {
  const form = (studio: string) => {
    const f = new FormData();
    f.set('studio', studio);
    return f;
  };

  it('un membre d’un autre studio ne démarre pas l’onboarding ni n’ouvre le tableau de bord du studio A', async () => {
    for (const action of [payouts.startOnboardingAction, payouts.openDashboardAction]) {
      await expect(action(form('std_a'))).rejects.toMatchObject({ url: '/studio/payouts?error=forbidden' });
    }
    const [s] = await h.db.select({ acct: studios.stripeAccountId }).from(studios).where(eq(studios.id, 'std_a'));
    expect(s!.acct).toBeNull();
  });

  it('finance : lecture seule ; propriétaire : autorisé (puis refus faute de Stripe en test)', async () => {
    login(U.financeA);
    await expect(payouts.startOnboardingAction(form('std_a'))).rejects.toMatchObject({ url: '/studio/payouts?studio=std_a&error=owner_only' });
    login(U.ownerA);
    await expect(payouts.startOnboardingAction(form('std_a'))).rejects.toMatchObject({ url: '/studio/payouts?studio=std_a&error=stripe_disabled' });
  });

  it('A-11 : session de plus de 30 min → ré-authentification, avant toute vérification du studio', async () => {
    login(U.ownerA, 31 * 60_000);
    await expect(payouts.startOnboardingAction(form('std_a'))).rejects.toMatchObject({
      url: `/login?reauth=1&next=${encodeURIComponent('/studio/payouts?studio=std_a')}`,
    });
    login(U.ownerA, 29 * 60_000);
    await expect(payouts.startOnboardingAction(form('std_a'))).rejects.toMatchObject({ url: '/studio/payouts?studio=std_a&error=stripe_disabled' });
  });
});

describe('A-11 : isRecentLogin / requireRecentLogin', () => {
  it('règle d’âge de la session', () => {
    const now = Date.now();
    expect(session.isRecentLogin(new Date(now - 1000), 60_000, now)).toBe(true);
    expect(session.isRecentLogin(new Date(now - 61_000), 60_000, now)).toBe(false);
    expect(session.isRecentLogin(null, 60_000, now)).toBe(false);
    expect(session.isRecentLogin('pas une date', 60_000, now)).toBe(false);
    expect(session.isRecentLogin(new Date(now + 3_600_000), 60_000, now)).toBe(false); // date future : refusée
    expect(session.ADMIN_RECENT_LOGIN_MS).toBe(12 * 3_600_000);
  });

  it('redirige un visiteur vers /login et une session ancienne vers /login?reauth=1', async () => {
    login(null);
    await expect(session.requireRecentLogin(60_000, '/admin')).rejects.toMatchObject({ url: '/login?next=%2Fadmin' });
    login(U.ownerA, 120_000);
    await expect(session.requireRecentLogin(60_000, '/admin')).rejects.toMatchObject({ url: '/login?reauth=1&next=%2Fadmin' });
    login(U.ownerA, 1000);
    await expect(session.requireRecentLogin(60_000, '/admin')).resolves.toEqual(U.ownerA);
  });
});
