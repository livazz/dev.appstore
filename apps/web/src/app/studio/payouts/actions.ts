'use server';

import { redirect } from 'next/navigation';
import { canManagePayouts, createDashboardLink, createOnboardingLink, ensureConnectAccount, getPayoutStudio } from '@/server/payouts';
import { requireUser } from '@/server/session';
import { appOrigin, isStripeEnabled } from '@/server/stripe';

const page = (studioId: string, extra = '') => `/studio/payouts?studio=${encodeURIComponent(studioId)}${extra}`;

async function authorize(formData: FormData) {
  const studioId = String(formData.get('studio') ?? '');
  const user = await requireUser(page(studioId));
  const studio = await getPayoutStudio(user.id, studioId);
  if (!studio) redirect('/studio/payouts?error=forbidden');
  // Lecture seule pour `finance` : seul le propriétaire crée / modifie le compte de versement.
  if (!canManagePayouts(studio.role)) redirect(page(studioId, '&error=owner_only'));
  if (!isStripeEnabled()) redirect(page(studioId, '&error=stripe_disabled'));
  return { user, studio };
}

/** Crée (si besoin) le compte Stripe Connect Express du studio puis envoie vers le formulaire d'onboarding Stripe. */
export async function startOnboardingAction(formData: FormData): Promise<void> {
  const { user, studio } = await authorize(formData);
  let url: string;
  try {
    const accountId = await ensureConnectAccount(studio, user.email);
    url = await createOnboardingLink(accountId, studio.id, await appOrigin());
  } catch (e) {
    console.error('[payouts] Onboarding Stripe impossible', studio.id, e instanceof Error ? e.message : 'erreur inconnue');
    redirect(page(studio.id, '&error=stripe'));
  }
  redirect(url);
}

/** Ouvre le tableau de bord Stripe Express du studio (versements, coordonnées bancaires). */
export async function openDashboardAction(formData: FormData): Promise<void> {
  const { studio } = await authorize(formData);
  if (!studio.stripeAccountId) redirect(page(studio.id));
  let url: string;
  try {
    url = await createDashboardLink(studio.stripeAccountId);
  } catch (e) {
    console.error('[payouts] Lien tableau de bord Stripe impossible', studio.id, e instanceof Error ? e.message : 'erreur inconnue');
    redirect(page(studio.id, '&error=stripe'));
  }
  redirect(url);
}
