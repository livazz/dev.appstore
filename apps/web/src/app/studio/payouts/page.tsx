import type { Metadata } from 'next';
import Link from 'next/link';
import { feeCents, formatMoney, STORE_FEE_BPS, type Currency } from '@wolleen/core';
import { SubmitButton } from '@/components/checkout/SubmitButton';
import { platformFeeBps } from '@/server/payments';
import { canManagePayouts, getPayoutStudios, getRecentStudioSales, getStudioRevenue, syncConnectStatus, type ConnectStatus } from '@/server/payouts';
import { requireUser } from '@/server/session';
import { chargeModel, isProduction, isStripeEnabled } from '@/server/stripe';
import { openDashboardAction, startOnboardingAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Paiements et versements — Wolleen' };

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const stripeMoney = (amount: number, currency: string) => formatMoney(amount, currency.toUpperCase() as Currency);

const ERRORS: Record<string, string> = {
  forbidden: 'Accès refusé pour ce studio.',
  owner_only: 'Seul le propriétaire du studio peut configurer les versements.',
  stripe_disabled: 'Stripe n’est pas configuré sur ce serveur.',
  stripe: 'Stripe est momentanément indisponible. Réessayez dans un instant.',
};

const btnPrimary =
  'inline-flex h-10 items-center justify-center rounded-[var(--radius)] bg-primary px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary';
const btnSecondary =
  'inline-flex h-10 items-center justify-center rounded-[var(--radius)] border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-bg';

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ studio?: string; onboarding?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser('/studio/payouts');
  const list = await getPayoutStudios(user.id);

  if (list.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Paiements et versements</h1>
        <div className="mt-6 rounded-[var(--radius)] border border-line bg-surface px-6 py-10 text-center">
          <p className="font-medium text-ink">Accès réservé</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">
            Seuls les propriétaires et responsables financiers d’un studio peuvent gérer les versements.
          </p>
          <Link href="/studio" className={`${btnPrimary} mt-5`}>
            Retour à mes jeux
          </Link>
        </div>
      </div>
    );
  }

  const studio = list.find((s) => s.id === sp.studio) ?? list[0]!;
  const stripeOn = isStripeEnabled();
  let connect: ConnectStatus | null = null;
  let connectError = false;
  if (stripeOn && studio.stripeAccountId) {
    try {
      connect = await syncConnectStatus(studio);
    } catch (e) {
      console.error('[payouts] Lecture du compte Stripe impossible', studio.id, e);
      connectError = true;
    }
  }
  const [revenue, sales] = await Promise.all([getStudioRevenue(studio.id), getRecentStudioSales(studio.id)]);
  const bps = platformFeeBps();
  const canManage = canManagePayouts(studio.role);
  // Sans compte prêt, les achats sont refusés en production (et toujours en charge directe) ; hors production,
  // la plateforme encaisse pour le compte du studio (tests).
  const pendingSalesNote =
    isProduction() || chargeModel() === 'direct'
      ? 'En attendant, vos articles ne peuvent pas être achetés.'
      : 'En attendant (hors production), les ventes de test sont encaissées par Wolleen pour votre compte.';
  const error = sp.error ? (ERRORS[sp.error] ?? ERRORS.stripe) : connectError ? ERRORS.stripe : null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Paiements et versements</h1>
          <p className="mt-1 text-sm text-ink-2">
            Vos ventes sont versées sur votre compte bancaire via Stripe Connect. Commission Wolleen : {bps / 100} % (contre{' '}
            {STORE_FEE_BPS / 100} % sur les stores).
          </p>
        </div>
        {list.length > 1 && (
          <nav aria-label="Studio" className="flex flex-wrap gap-1 rounded-[var(--radius)] bg-line/50 p-1 text-sm">
            {list.map((s) => (
              <Link
                key={s.id}
                href={`/studio/payouts?studio=${encodeURIComponent(s.id)}`}
                aria-current={s.id === studio.id ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 ${s.id === studio.id ? 'bg-surface font-semibold text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
              >
                {s.name}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-[var(--radius)] bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <section className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="account-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="account-title" className="text-lg font-semibold text-ink">
              Compte de versement
            </h2>
            <p className="mt-0.5 text-sm text-ink-2">{studio.name}</p>
          </div>
          {stripeOn && <AccountBadges studio={studio} connect={connect} />}
        </div>

        {!stripeOn ? (
          <div className="mt-4 rounded-[var(--radius)] border border-warn/30 bg-warn/10 p-4 text-sm text-ink">
            <p className="font-semibold text-warn">Mode démo — Stripe n’est pas configuré</p>
            <p className="mt-1 text-ink-2">
              Les achats sont simulés : aucun paiement réel n’est encaissé et aucun versement n’est effectué. Pour activer les vrais
              paiements, l’administrateur de la plateforme définit <code className="font-mono text-xs">STRIPE_SECRET_KEY</code> et{' '}
              <code className="font-mono text-xs">STRIPE_WEBHOOK_SECRET</code>. Vous pourrez alors relier votre compte bancaire ici
              en quelques minutes avec Stripe Connect.
            </p>
          </div>
        ) : !studio.stripeAccountId ? (
          <div className="mt-4">
            <p className="max-w-2xl text-sm text-ink-2">
              Créez votre compte de versement Stripe pour recevoir vos ventes : identité de l’entreprise et coordonnées bancaires,
              saisies directement chez Stripe. {pendingSalesNote}
            </p>
            {canManage ? <OnboardingForm studioId={studio.id} label="Configurer les versements" /> : <OwnerOnlyNote />}
          </div>
        ) : connect && connect.chargesEnabled && connect.detailsSubmitted ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink-2">
              Votre compte est actif : chaque vente vous est reversée automatiquement, commission Wolleen déduite.
            </p>
            {canManage && (
              <form action={openDashboardAction}>
                <input type="hidden" name="studio" value={studio.id} />
                <SubmitButton pendingLabel="Ouverture…" className={btnSecondary}>
                  Ouvrir le tableau de bord Stripe
                </SubmitButton>
              </form>
            )}
          </div>
        ) : (
          <div className="mt-4">
            {sp.onboarding === 'return' && (
              <p className="mb-3 text-sm text-ink">Merci ! Stripe vérifie vos informations, cela peut prendre quelques minutes.</p>
            )}
            {sp.onboarding === 'refresh' && <p className="mb-3 text-sm text-ink">Le lien de configuration a expiré : reprenez où vous en étiez.</p>}
            <p className="max-w-2xl text-sm text-ink-2">
              La configuration de votre compte n’est pas terminée
              {connect && connect.requirementsDue.length > 0 ? ` (${connect.requirementsDue.length} information(s) demandée(s) par Stripe)` : ''}.
              {pendingSalesNote}
            </p>
            {canManage ? <OnboardingForm studioId={studio.id} label="Terminer la configuration" /> : <OwnerOnlyNote />}
          </div>
        )}
      </section>

      {connect?.balance && (
        <section className="mt-6 grid gap-4 sm:grid-cols-2" aria-label="Solde Stripe">
          <Stat label="Solde disponible" value={moneyList(connect.balance.available)} hint="sera versé au prochain virement" />
          <Stat label="En attente" value={moneyList(connect.balance.pending)} hint="ventes récentes en cours de traitement" />
        </section>
      )}

      <section className="mt-6" aria-labelledby="revenue-title">
        <h2 id="revenue-title" className="text-lg font-semibold text-ink">
          Revenus
        </h2>
        {revenue.length === 0 ? (
          <p className="mt-2 rounded-[var(--radius)] border border-line bg-surface px-4 py-6 text-center text-sm text-ink-2">
            Aucune vente payée pour l’instant.
          </p>
        ) : (
          revenue.map((r) => {
            const viaStores = r.grossCents - feeCents(r.grossCents, STORE_FEE_BPS);
            return (
              <div key={r.currency} className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Revenu brut" value={formatMoney(r.grossCents, r.currency)} hint={`${r.orders} vente${r.orders > 1 ? 's' : ''}`} />
                <Stat label="Commission Wolleen" value={formatMoney(r.feeCents, r.currency)} hint="figée au moment de chaque achat" />
                <Stat label="Votre revenu net" value={formatMoney(r.netCents, r.currency)} hint="avant frais bancaires éventuels" />
                <Stat
                  label="Gagné en plus vs stores"
                  value={`+${formatMoney(Math.max(0, r.netCents - viaStores), r.currency)}`}
                  hint={`via les stores : ${formatMoney(viaStores, r.currency)}`}
                  highlight
                />
              </div>
            );
          })
        )}
      </section>

      {connect && connect.payouts.length > 0 && (
        <section className="mt-6" aria-labelledby="payouts-title">
          <h2 id="payouts-title" className="text-lg font-semibold text-ink">
            Derniers virements
          </h2>
          <div className="mt-3 overflow-x-auto rounded-[var(--radius)] border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="px-4 py-2 font-medium">Arrivée prévue</th>
                  <th className="px-4 py-2 font-medium">Statut</th>
                  <th className="px-4 py-2 text-right font-medium">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {connect.payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2">{dateFmt.format(p.arrivalDate)}</td>
                    <td className="px-4 py-2">{PAYOUT_STATUS[p.status] ?? p.status}</td>
                    <td className="px-4 py-2 text-right font-medium">{stripeMoney(p.amount, p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-6" aria-labelledby="sales-title">
        <h2 id="sales-title" className="text-lg font-semibold text-ink">
          Dernières ventes
        </h2>
        {sales.length === 0 ? (
          <p className="mt-2 text-sm text-ink-2">Les ventes apparaîtront ici.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-[var(--radius)] border border-line bg-surface">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Article</th>
                  <th className="px-4 py-2 text-right font-medium">Montant</th>
                  <th className="px-4 py-2 text-right font-medium">Commission</th>
                  <th className="px-4 py-2 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-ink-2">{s.paidAt ? dateTimeFmt.format(s.paidAt) : '—'}</td>
                    <td className="px-4 py-2">
                      <span className="font-medium text-ink">{s.itemTitle}</span>
                      <span className="text-ink-3"> · {s.gameName}</span>
                      {!s.paymentIntentId && (
                        <span className="ml-2 rounded-full bg-warn/10 px-2 py-0.5 text-xs font-medium text-warn">Démo</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">{formatMoney(s.amountCents, s.currency)}</td>
                    <td className="px-4 py-2 text-right text-ink-2">−{formatMoney(s.feeCents, s.currency)}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatMoney(s.amountCents - s.feeCents, s.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const PAYOUT_STATUS: Record<string, string> = {
  paid: 'Versé',
  pending: 'En attente',
  in_transit: 'En cours',
  canceled: 'Annulé',
  failed: 'Échoué',
};

function moneyList(list: { amount: number; currency: string }[]) {
  return list.length ? list.map((b) => stripeMoney(b.amount, b.currency)).join(' · ') : formatMoney(0);
}

function OwnerOnlyNote() {
  return <p className="mt-4 text-sm text-ink-3">Accès en lecture seule : seul le propriétaire du studio peut configurer les versements.</p>;
}

function OnboardingForm({ studioId, label }: { studioId: string; label: string }) {
  return (
    <form action={startOnboardingAction} className="mt-4">
      <input type="hidden" name="studio" value={studioId} />
      <SubmitButton pendingLabel="Redirection vers Stripe…" className={btnPrimary}>
        {label}
      </SubmitButton>
    </form>
  );
}

function AccountBadges({ studio, connect }: { studio: { stripeAccountId: string | null; stripeChargesEnabled: boolean }; connect: ConnectStatus | null }) {
  if (!studio.stripeAccountId) return <Badge tone="muted">Non configuré</Badge>;
  const charges = connect?.chargesEnabled ?? studio.stripeChargesEnabled;
  return (
    <div className="flex flex-wrap gap-2">
      <Badge tone={charges ? 'ok' : 'warn'}>{charges ? 'Paiements activés' : 'Paiements en attente'}</Badge>
      {connect && <Badge tone={connect.payoutsEnabled ? 'ok' : 'warn'}>{connect.payoutsEnabled ? 'Virements activés' : 'Virements en attente'}</Badge>}
    </div>
  );
}

function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'muted'; children: React.ReactNode }) {
  const cls = { ok: 'bg-ok/10 text-ok', warn: 'bg-warn/10 text-warn', muted: 'bg-ink-3/10 text-ink-2' }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{children}</span>;
}

function Stat({ label, value, hint, highlight }: { label: string; value: string; hint?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-[var(--radius)] border p-4 ${highlight ? 'border-ok/30 bg-ok/5' : 'border-line bg-surface'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${highlight ? 'text-ok' : 'text-ink'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}
