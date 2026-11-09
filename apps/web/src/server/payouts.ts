import 'server-only';
import type Stripe from 'stripe';
import type { Currency, StudioRole } from '@devappstore/core';
import { and, count, db, desc, eq, games, inArray, isNull, orders, studioMembers, studios, sum } from '@devappstore/db';
import { getStripe, isStripeEnabled } from '@/server/stripe';

/*
 * Versements studio (tâche « payments ») : onboarding Stripe Connect Express et état des revenus.
 * Accès réservé aux membres « owner » ou « finance » du studio.
 */

export const PAYOUT_ROLES: StudioRole[] = ['owner', 'finance'];

/**
 * Rôles autorisés à MODIFIER les versements (création du compte Connect, onboarding, tableau de bord Stripe) :
 * owner uniquement — `finance` est en lecture seule (matrice des rôles, threat-model § 6.6, CHK-MT-06 / CHK-PAY-12).
 */
export const PAYOUT_MANAGE_ROLES: StudioRole[] = ['owner'];

export function canManagePayouts(role: StudioRole): boolean {
  return PAYOUT_MANAGE_ROLES.includes(role);
}

export type PayoutStudio = typeof studios.$inferSelect & { role: StudioRole };

/** Studios dont l'utilisateur est owner/finance. */
export async function getPayoutStudios(userId: string): Promise<PayoutStudio[]> {
  const rows = await db
    .select({ studio: studios, role: studioMembers.role })
    .from(studioMembers)
    .innerJoin(studios, eq(studios.id, studioMembers.studioId))
    .where(and(eq(studioMembers.userId, userId), inArray(studioMembers.role, PAYOUT_ROLES)))
    .orderBy(studios.name);
  return rows.map((r) => ({ ...r.studio, role: r.role }));
}

/** Studio si l'utilisateur y a un rôle owner/finance, sinon null. */
export async function getPayoutStudio(userId: string, studioId: string): Promise<PayoutStudio | null> {
  return (await getPayoutStudios(userId)).find((s) => s.id === studioId) ?? null;
}

export interface RevenueLine {
  currency: Currency;
  orders: number;
  grossCents: number;
  feeCents: number;
  netCents: number;
}

/** Revenus des commandes payées du studio, par devise : brut, commission Dev AppStore, net reversé. */
export async function getStudioRevenue(studioId: string): Promise<RevenueLine[]> {
  const rows = await db
    .select({ currency: orders.currency, n: count(), gross: sum(orders.amountCents), fee: sum(orders.platformFeeCents) })
    .from(orders)
    .innerJoin(games, eq(games.id, orders.gameId))
    .where(and(eq(games.studioId, studioId), eq(orders.status, 'paid')))
    .groupBy(orders.currency);
  return rows.map((r) => {
    const grossCents = Number(r.gross ?? 0);
    const feeCents = Number(r.fee ?? 0);
    return { currency: r.currency, orders: Number(r.n), grossCents, feeCents, netCents: grossCents - feeCents };
  });
}

/** Dernières ventes payées du studio. */
export async function getRecentStudioSales(studioId: string, limit = 10) {
  return db
    .select({
      id: orders.id,
      paidAt: orders.paidAt,
      gameName: games.name,
      itemTitle: orders.itemTitle,
      amountCents: orders.amountCents,
      feeCents: orders.platformFeeCents,
      currency: orders.currency,
      paymentIntentId: orders.stripePaymentIntentId,
    })
    .from(orders)
    .innerJoin(games, eq(games.id, orders.gameId))
    .where(and(eq(games.studioId, studioId), eq(orders.status, 'paid')))
    .orderBy(desc(orders.paidAt))
    .limit(limit);
}

export interface ConnectStatus {
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  balance: { available: { amount: number; currency: string }[]; pending: { amount: number; currency: string }[] } | null;
  payouts: { id: string; amount: number; currency: string; status: string; arrivalDate: Date }[];
}

/**
 * Lit le compte Connect chez Stripe, met à jour stripeChargesEnabled (au cas où le webhook account.updated
 * n'est pas configuré), et récupère solde + derniers virements. null si Stripe est désactivé ou pas de compte.
 */
export async function syncConnectStatus(studio: Pick<PayoutStudio, 'id' | 'stripeAccountId' | 'stripeChargesEnabled'>): Promise<ConnectStatus | null> {
  if (!isStripeEnabled() || !studio.stripeAccountId) return null;
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(studio.stripeAccountId);
  const chargesEnabled = Boolean(account.charges_enabled);
  if (chargesEnabled !== studio.stripeChargesEnabled) {
    await db.update(studios).set({ stripeChargesEnabled: chargesEnabled }).where(eq(studios.id, studio.id));
  }
  let balance: ConnectStatus['balance'] = null;
  let payouts: ConnectStatus['payouts'] = [];
  if (account.details_submitted) {
    const opts: Stripe.RequestOptions = { stripeAccount: account.id };
    const [b, p] = await Promise.allSettled([stripe.balance.retrieve({}, opts), stripe.payouts.list({ limit: 5 }, opts)]);
    if (b.status === 'fulfilled') {
      balance = {
        available: b.value.available.map((x) => ({ amount: x.amount, currency: x.currency })),
        pending: b.value.pending.map((x) => ({ amount: x.amount, currency: x.currency })),
      };
    }
    if (p.status === 'fulfilled') {
      payouts = p.value.data.map((x) => ({ id: x.id, amount: x.amount, currency: x.currency, status: x.status, arrivalDate: new Date(x.arrival_date * 1000) }));
    }
  }
  return {
    accountId: account.id,
    chargesEnabled,
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    requirementsDue: account.requirements?.currently_due ?? [],
    balance,
    payouts,
  };
}

/** Crée le compte Connect Express du studio s'il n'existe pas encore (idempotent), et renvoie son id. */
export async function ensureConnectAccount(studio: Pick<PayoutStudio, 'id' | 'name' | 'stripeAccountId'>, email: string): Promise<string> {
  if (studio.stripeAccountId) return studio.stripeAccountId;
  const account = await getStripe().accounts.create(
    {
      type: 'express',
      email,
      business_profile: { name: studio.name },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { studio_id: studio.id },
    },
    { idempotencyKey: `devappstore_connect_${studio.id}` },
  );
  // Ne remplace jamais un compte enregistré entre-temps par une requête concurrente.
  const [saved] = await db
    .update(studios)
    .set({ stripeAccountId: account.id, stripeChargesEnabled: Boolean(account.charges_enabled) })
    .where(and(eq(studios.id, studio.id), isNull(studios.stripeAccountId)))
    .returning({ id: studios.stripeAccountId });
  if (saved?.id) return saved.id;
  const [current] = await db.select({ id: studios.stripeAccountId }).from(studios).where(eq(studios.id, studio.id));
  return current?.id ?? account.id;
}

/** Lien d'onboarding Stripe (formulaire hébergé par Stripe). */
export async function createOnboardingLink(accountId: string, studioId: string, origin: string): Promise<string> {
  const base = `${origin}/studio/payouts?studio=${encodeURIComponent(studioId)}`;
  const link = await getStripe().accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${base}&onboarding=refresh`,
    return_url: `${base}&onboarding=return`,
  });
  return link.url;
}

/** Lien de connexion au tableau de bord Express du studio. */
export async function createDashboardLink(accountId: string): Promise<string> {
  return (await getStripe().accounts.createLoginLink(accountId)).url;
}
