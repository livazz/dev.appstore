import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney } from '@devappstore/core';
import { getLoyaltyOverview, listHistory, listRewards, type HistoryRow, type RewardView } from '@/server/loyalty';
import { minOrderForDiscount } from '@/server/loyalty-logic';
import { platformFeeBps } from '@/server/payments';
import { requireUser } from '@/server/session';
import { RedeemButton } from './RedeemButton';
import { safeImageUrl } from '@/components/store/style-safety';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mes Points Dev AppStore', robots: { index: false } };

const PAGE_SIZE = 20;
const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });
const pts = (n: number) => `${n.toLocaleString('fr-FR')} point${Math.abs(n) > 1 ? 's' : ''}`;

const BLOCKED_LABELS: Record<NonNullable<RewardView['blocked']>, string> = {
  insufficient_points: 'Points insuffisants',
  not_linked: 'Compte de jeu non lié',
  limit_reached: 'Déjà obtenu',
  out_of_stock: 'Épuisé',
};

function historyLabel(r: HistoryRow): string {
  switch (r.reason) {
    case 'order_award':
      return `Achat : ${r.itemTitle ?? 'commande'}${r.gameName ? ` (${r.gameName})` : ''}`;
    case 'order_revoke':
      return `Remboursement : ${r.itemTitle ?? 'commande'}${r.gameName ? ` (${r.gameName})` : ''}`;
    case 'redemption':
      return `Échange : ${r.redemptionTitle ?? 'récompense'}`;
    case 'expiry':
      return 'Points expirés';
    case 'adjustment':
      return r.note ? `Ajustement : ${r.note}` : 'Ajustement du support';
  }
}

export default async function PointsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser('/account/points');
  const raw = (await searchParams).page;
  const page = Math.max(1, Math.floor(Number(Array.isArray(raw) ? raw[0] : raw)) || 1);
  const [overview, rewards, history] = await Promise.all([
    getLoyaltyOverview(user.id),
    listRewards(user.id),
    listHistory(user.id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  ]);
  const pages = Math.max(1, Math.ceil(history.total / PAGE_SIZE));
  const { config } = overview;
  const ttlMonths = Math.round(config.pointsTtlDays / 30.4);
  const feeBps = platformFeeBps();
  /** Montant minimum de commande pour utiliser un bon (la réduction ne dépasse jamais la commission Dev AppStore). */
  const minOrder = (valueCents: number, currency: Parameters<typeof formatMoney>[1]) => {
    const m = minOrderForDiscount(valueCents, feeBps);
    return m == null ? null : formatMoney(m, currency);
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Mon compte</h1>
      <p className="mt-1 text-sm text-ink-2">
        {user.name} · {user.email}
      </p>

      <nav aria-label="Sections du compte" className="mt-6 flex gap-x-5 overflow-x-auto border-b border-line text-sm whitespace-nowrap [scrollbar-width:none] sm:gap-x-6">
        <Link href="/account" className="pb-2 text-ink-2 transition hover:text-ink">
          Mes jeux liés
        </Link>
        <Link href="/account/purchases" className="pb-2 text-ink-2 transition hover:text-ink">
          Historique des achats
        </Link>
        <span aria-current="page" className="-mb-px border-b-2 border-ink pb-2 font-semibold text-ink">
          Points Dev AppStore
        </span>
      </nav>

      {!overview.enabled && (
        <p className="mt-6 rounded-[var(--radius)] border border-line bg-surface px-4 py-3 text-sm text-ink-2">
          Le programme Points Dev AppStore n’est pas encore ouvert. Vos achats ne rapportent pas encore de points.
        </p>
      )}

      {/* Solde */}
      <section aria-labelledby="balance" className="mt-6 rounded-[var(--radius)] border border-line bg-surface p-6">
        <h2 id="balance" className="text-sm font-medium text-ink-2">
          Solde disponible
        </h2>
        <p className="mt-1 text-4xl font-semibold tabular-nums text-ink">
          {overview.balance.toLocaleString('fr-FR')} <span className="text-lg font-medium text-ink-2">{overview.balance > 1 ? 'points' : 'point'}</span>
        </p>
        {overview.expiringSoon.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-warn">
            {overview.expiringSoon.map((e) => (
              <li key={e.expiresAt.toISOString()}>
                {pts(e.points)} expire{e.points > 1 ? 'nt' : ''} le {dateFmt.format(e.expiresAt)}.
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-ink-2">
          Chaque achat payé sur Dev AppStore vous rapporte des points, dans tous les jeux. Les points sont valables {ttlMonths} mois.
        </p>
      </section>

      {/* Bons */}
      {overview.vouchers.length > 0 && (
        <section aria-labelledby="vouchers" className="mt-8">
          <h2 id="vouchers" className="text-lg font-semibold text-ink">
            Mes bons de réduction
          </h2>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[var(--radius)] border border-line bg-surface">
            {overview.vouchers.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{v.title}</p>
                  <p className="text-xs text-ink-3">
                    Obtenu le {dateFmt.format(v.createdAt)}
                    {v.expiresAt && <> · valable jusqu’au {dateFmt.format(v.expiresAt)}</>}
                    {minOrder(v.valueCents, v.currency) && <> · dès {minOrder(v.valueCents, v.currency)} d’achat</>}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-brand px-3 py-1 text-sm font-semibold tabular-nums text-ink">
                  −{formatMoney(v.valueCents, v.currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Récompenses */}
      <section aria-labelledby="rewards" className="mt-8">
        <h2 id="rewards" className="text-lg font-semibold text-ink">
          Récompenses
        </h2>
        {rewards.length === 0 ? (
          <p className="mt-3 rounded-[var(--radius)] border border-line bg-surface px-6 py-8 text-center text-sm text-ink-2">
            Aucune récompense disponible pour l’instant.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {rewards.map((r) => (
              <li key={r.id} className="flex flex-col rounded-[var(--radius)] border border-line bg-surface p-4">
                <div className="flex items-start gap-3">
                  {safeImageUrl(r.game?.iconUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- icônes en data: URL ou /api/uploads
                    <img src={safeImageUrl(r.game?.iconUrl)!} alt="" className="size-11 shrink-0 rounded-[22%] border border-line object-cover" />
                  ) : (
                    <div aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[22%] bg-brand text-lg font-bold text-ink">
                      {r.kind === 'discount' ? '%' : 'D'}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{r.title}</p>
                    <p className="text-xs text-ink-3">
                      {r.kind === 'discount' ? 'Bon de réduction offert par Dev AppStore' : r.game ? `Offert par ${r.game.name}` : 'Objet offert par le studio'}
                    </p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-ink">{pts(r.pointsCost)}</span>
                </div>
                {r.description && <p className="mt-2 text-sm text-ink-2">{r.description}</p>}
                {r.kind === 'discount' && r.valueCents && minOrder(r.valueCents, r.currency) && (
                  <p className="mt-1 text-xs text-ink-3">
                    Utilisable sur une commande d’au moins {minOrder(r.valueCents, r.currency)}, valable {r.voucherTtlDays} jours.
                  </p>
                )}
                {r.kind === 'bonus_item' && r.blocked === 'not_linked' && r.game && (
                  <Link href={`/games/${encodeURIComponent(r.game.slug)}/link`} className="mt-2 text-sm text-primary hover:underline">
                    Lier mon compte {r.game.name}
                  </Link>
                )}
                <div className="mt-auto">
                  <RedeemButton rewardId={r.id} title={r.title} pointsCost={r.pointsCost} blockedLabel={!overview.enabled ? 'Bientôt disponible' : r.blocked ? BLOCKED_LABELS[r.blocked] : null} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Historique */}
      <section aria-labelledby="history" className="mt-8">
        <h2 id="history" className="text-lg font-semibold text-ink">
          Historique
        </h2>
        {history.rows.length === 0 ? (
          <p className="mt-3 rounded-[var(--radius)] border border-line bg-surface px-6 py-8 text-center text-sm text-ink-2">
            Aucun mouvement de points pour l’instant.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[var(--radius)] border border-line bg-surface">
            {history.rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{historyLabel(r)}</p>
                  <p className="text-xs text-ink-3">
                    {dateFmt.format(r.createdAt)}
                    {r.delta > 0 && r.expiresAt && <> · expire le {dateFmt.format(r.expiresAt)}</>}
                  </p>
                </div>
                <span className={`shrink-0 font-semibold tabular-nums ${r.delta > 0 ? 'text-ok' : 'text-ink-2'}`}>
                  {r.delta > 0 ? '+' : '−'}
                  {Math.abs(r.delta).toLocaleString('fr-FR')}
                </span>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination de l’historique">
            {page > 1 ? (
              <Link href={`?page=${page - 1}`} className="rounded-lg border border-line bg-surface px-3 py-1.5 hover:bg-bg">
                ← Plus récents
              </Link>
            ) : (
              <span />
            )}
            <span className="text-ink-2">
              Page {Math.min(page, pages)} sur {pages}
            </span>
            {page < pages ? (
              <Link href={`?page=${page + 1}`} className="rounded-lg border border-line bg-surface px-3 py-1.5 hover:bg-bg">
                Plus anciens →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>

      {/* Règles */}
      <section aria-labelledby="rules" className="mt-8 rounded-[var(--radius)] border border-line bg-surface p-5 text-sm text-ink-2">
        <h2 id="rules" className="font-semibold text-ink">
          Comment ça marche
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Vos achats payés rapportent des points, quel que soit le jeu. Les objets offerts ne rapportent pas de points.</li>
          <li>Les points sont valables {ttlMonths} mois ; ceux qui expirent le plus tôt sont utilisés en premier.</li>
          <li>Si un achat est remboursé, les points qu’il a rapportés sont retirés (dans la limite de votre solde).</li>
          <li>
            Les bons de réduction sont financés par Dev AppStore sur sa commission : le studio reçoit sa part en entier. C’est pourquoi un bon s’utilise à partir
            d’un montant minimum de commande{minOrder(100, 'EUR') ? ` (par exemple ${minOrder(100, 'EUR')} pour un bon de 1 €)` : ''}.
          </li>
          <li>Les objets bonus sont offerts par les studios participants et livrés dans votre jeu lié.</li>
          <li>
            Les points n’ont pas de valeur monétaire : ils ne s’achètent pas, ne s’échangent pas contre de l’argent et ne peuvent pas être transférés à un autre
            compte.
          </li>
        </ul>
      </section>
    </main>
  );
}
