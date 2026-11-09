import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { formatMoney } from '@wolleen/core';
import { OrderSummary } from '@/components/checkout/OrderSummary';
import { SubmitButton } from '@/components/checkout/SubmitButton';
import { gameItemPath, getOrderForUser, successPath } from '@/server/payments';
import { requireUser } from '@/server/session';
import { isSimulationAllowed } from '@/server/stripe';
import { payMockOrderAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Paiement (démo) — Wolleen', robots: { index: false } };

const ERRORS: Record<string, string> = {
  simulation_forbidden: 'Le mode démo est désactivé sur ce serveur.',
  order_not_found: 'Commande introuvable.',
  order_not_payable: 'Cette commande ne peut plus être payée.',
};

/** Paiement simulé (STRIPE_SECRET_KEY vide, hors production). */
export default async function MockCheckoutPage({ searchParams }: { searchParams: Promise<{ order?: string; error?: string }> }) {
  // Jamais accessible avec une vraie configuration de paiement.
  if (!isSimulationAllowed()) notFound();
  const sp = await searchParams;
  const orderId = typeof sp.order === 'string' ? sp.order : '';
  const user = await requireUser(`/checkout/mock?order=${encodeURIComponent(orderId)}`);
  const view = orderId ? await getOrderForUser(orderId, user.id) : null;
  if (!view) notFound();
  if (view.order.status === 'paid') redirect(successPath(orderId));

  const { order, game } = view;
  const back = gameItemPath(game.slug, order.itemId);
  const payable = order.status === 'pending';
  const error = sp.error ? (ERRORS[sp.error] ?? 'Le paiement a échoué.') : null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div
        role="note"
        className="mb-4 flex items-center gap-2 rounded-[var(--radius)] border border-warn/30 bg-warn/10 px-3 py-2 text-sm font-semibold text-warn"
      >
        <span aria-hidden="true">⚠︎</span>
        Mode démo — aucun paiement réel
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6" aria-labelledby="mock-title">
        <h1 id="mock-title" className="text-xl font-semibold tracking-tight text-ink">
          Paiement
        </h1>
        <p className="mt-1 text-sm text-ink-2">
          Stripe n’est pas configuré : ce paiement est simulé. L’achat sera tout de même livré dans le jeu.
        </p>

        <div className="mt-5">
          <OrderSummary view={view} />
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-[var(--radius)] bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        {!payable && !error && (
          <p role="alert" className="mt-4 rounded-[var(--radius)] bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            Cette commande n’est plus valide. Relancez l’achat depuis la boutique.
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <Link
            href={back}
            className="inline-flex h-11 flex-none items-center justify-center rounded-[var(--radius)] bg-cancel px-5 font-semibold text-white hover:opacity-90"
          >
            Annuler
          </Link>
          {payable && (
            <form action={payMockOrderAction} className="min-w-0 flex-1">
              <input type="hidden" name="order" value={order.id} />
              <SubmitButton
                pendingLabel="Paiement…"
                className="inline-flex h-11 w-full items-center justify-center rounded-[var(--radius)] bg-primary px-6 font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Payer {formatMoney(order.amountCents, order.currency)}
              </SubmitButton>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
