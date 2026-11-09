import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AutoRefresh } from '@/components/checkout/AutoRefresh';
import { OrderSummary } from '@/components/checkout/OrderSummary';
import { gameItemPath, getOrderForUser, syncOrderWithStripe, type OrderView } from '@/server/payments';
import { requireUser } from '@/server/session';
import { isStripeEnabled } from '@/server/stripe';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Votre achat — Dev AppStore', robots: { index: false } };

type Phase = 'confirming' | 'delivering' | 'delivered' | 'credited' | 'delivery_failed' | 'payment_failed' | 'refunded';
type StepState = 'done' | 'current' | 'todo' | 'error';

function phaseOf({ order, delivery }: OrderView): Phase {
  if (order.status === 'pending') return 'confirming';
  if (order.status === 'failed') return 'payment_failed';
  if (order.status === 'refunded') return 'refunded';
  switch (delivery?.status) {
    case 'acknowledged':
      return 'credited';
    case 'delivered':
      return 'delivered';
    case 'failed':
      return 'delivery_failed';
    default:
      return 'delivering';
  }
}

const STEPS: Record<Phase, [StepState, StepState, StepState]> = {
  confirming: ['current', 'todo', 'todo'],
  delivering: ['done', 'current', 'todo'],
  delivered: ['done', 'done', 'done'],
  credited: ['done', 'done', 'done'],
  delivery_failed: ['done', 'error', 'todo'],
  payment_failed: ['error', 'todo', 'todo'],
  refunded: ['done', 'done', 'done'],
};

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const sp = await searchParams;
  const orderId = typeof sp.order === 'string' ? sp.order : '';
  const user = await requireUser(`/checkout/success?order=${encodeURIComponent(orderId)}`);
  let view = orderId ? await getOrderForUser(orderId, user.id) : null;
  if (!view) notFound();

  // Webhook pas encore reçu (ou non configuré en local) : on interroge Stripe directement.
  if (view.order.status === 'pending' && isStripeEnabled()) {
    await syncOrderWithStripe(orderId);
    view = (await getOrderForUser(orderId, user.id)) ?? view;
  }

  const { order, game, delivery } = view;
  const phase = phaseOf(view);
  const active = phase === 'confirming' || phase === 'delivering';
  const retrying = phase === 'delivering' && (delivery?.attempts ?? 0) > 0 && !!delivery?.lastError;

  const copy: Record<Phase, { title: string; text: string }> = {
    confirming: {
      title: 'Confirmation du paiement…',
      text: 'Nous attendons la confirmation du paiement. Cette page se met à jour automatiquement.',
    },
    delivering: {
      title: 'Votre achat arrive dans le jeu…',
      text: retrying
        ? `Paiement reçu. ${game.name} n’a pas encore répondu : nouvelle tentative automatique en cours.`
        : `Paiement reçu. Nous transmettons l’achat à ${game.name} : gardez le jeu ouvert, il sera crédité automatiquement.`,
    },
    delivered: {
      title: 'Livré dans le jeu',
      text: `L’achat a été transmis à ${game.name}. Il apparaît dans votre inventaire (relancez le jeu si besoin).`,
    },
    credited: {
      title: 'C’est dans votre inventaire !',
      text: `${game.name} a confirmé la réception de votre achat. Bon jeu !`,
    },
    delivery_failed: {
      title: 'La livraison prend du retard',
      text: `Votre paiement est bien reçu, mais ${game.name} n’a pas pu recevoir l’achat. Le studio va le livrer dès que possible ; gardez la référence ci-dessous.`,
    },
    payment_failed: {
      title: 'Le paiement n’a pas abouti',
      text: 'Aucun montant n’a été débité. Vous pouvez relancer l’achat depuis la boutique.',
    },
    refunded: { title: 'Achat remboursé', text: 'Cet achat a été remboursé.' },
  };

  const tone = phase === 'payment_failed' ? 'danger' : phase === 'delivery_failed' ? 'warn' : active ? 'progress' : 'ok';

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6" aria-labelledby="status-title">
        <div className="flex flex-col items-center text-center" aria-live="polite">
          <StatusIcon tone={tone} />
          <h1 id="status-title" className="mt-4 text-xl font-semibold tracking-tight text-ink">
            {copy[phase].title}
          </h1>
          <p className="mt-2 text-sm text-ink-2">{copy[phase].text}</p>
        </div>

        <ol className="mt-6 grid grid-cols-3 gap-2" aria-label="Étapes">
          {(['Paiement', 'Envoi au jeu', 'Livré'] as const).map((label, i) => (
            <Step key={label} label={label} state={STEPS[phase][i]!} />
          ))}
        </ol>

        <AutoRefresh active={active} />

        <div className="mt-6">
          <OrderSummary view={view} showDate />
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            href={gameItemPath(game.slug, order.itemId)}
            className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-[var(--radius)] bg-primary sm:flex-1 px-5 font-semibold text-white hover:opacity-90"
          >
            {phase === 'payment_failed' ? 'Réessayer' : 'Retour à la boutique'}
          </Link>
          <Link
            href="/account/purchases"
            className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-[var(--radius)] border border-line bg-surface px-5 font-semibold text-ink hover:bg-bg sm:flex-none"
          >
            Mes achats
          </Link>
        </div>
      </section>
    </div>
  );
}

function StatusIcon({ tone }: { tone: 'ok' | 'warn' | 'danger' | 'progress' }) {
  if (tone === 'progress') {
    return (
      <span className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
        <svg className="size-7 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  const cls = { ok: 'bg-ok/10 text-ok', warn: 'bg-warn/10 text-warn', danger: 'bg-danger/10 text-danger' }[tone];
  return (
    <span className={`grid size-14 place-items-center rounded-full text-2xl font-bold ${cls}`} aria-hidden="true">
      {tone === 'ok' ? '✓' : '!'}
    </span>
  );
}

function Step({ label, state }: { label: string; state: StepState }) {
  const bar = { done: 'bg-ok', current: 'bg-primary animate-pulse', todo: 'bg-line', error: 'bg-danger' }[state];
  const text = { done: 'text-ink', current: 'text-primary font-semibold', todo: 'text-ink-3', error: 'text-danger font-semibold' }[state];
  const sr = { done: 'terminé', current: 'en cours', todo: 'à venir', error: 'problème' }[state];
  return (
    <li className="flex flex-col gap-1.5" aria-current={state === 'current' ? 'step' : undefined}>
      <span className={`h-1.5 rounded-full ${bar}`} aria-hidden="true" />
      <span className={`text-xs ${text}`}>
        {label}
        <span className="sr-only"> : {sr}</span>
      </span>
    </li>
  );
}
