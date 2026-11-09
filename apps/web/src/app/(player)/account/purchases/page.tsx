import Link from 'next/link';
import { formatMoney } from '@devappstore/core';
import { requireUser } from '@/server/session';
import { getPlayerPurchases } from '@/server/analytics';
import { WITHDRAWAL_ERROR_MESSAGES, withdrawableOrderIds, type WithdrawalErrorCode } from '@/server/withdrawal';
import { formatDateTime, playerDeliveryLabel, TONE_CLASSES } from '@/lib/analytics-format';
import { confirmWithdrawal } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes achats — Dev AppStore' };

const PAGE_SIZE = 25;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser('/account/purchases');
  const sp = await searchParams;
  const page = Math.max(1, Math.floor(Number(first(sp.page))) || 1);
  const { rows, total } = await getPlayerPurchases(user.id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Bouton « Me rétracter » : commande payée, livraison pas encore effectuée (en attente ou en échec), passée il y a moins de 14 jours.
  const withdrawable = await withdrawableOrderIds(user.id, rows.map((r) => r.id));
  const confirming = rows.find((r) => r.id === first(sp.withdraw) && withdrawable.has(r.id));
  const withdrawnId = first(sp.withdrawn);
  const withdrawn = withdrawnId ? rows.find((r) => r.id === withdrawnId) : undefined;
  const errorCode = first(sp.withdrawal_error);
  const withdrawalError = errorCode && errorCode in WITHDRAWAL_ERROR_MESSAGES ? WITHDRAWAL_ERROR_MESSAGES[errorCode as WithdrawalErrorCode] : null;
  const withPage = (extra: Record<string, string>) => {
    const p = new URLSearchParams(extra);
    if (page > 1) p.set('page', String(page));
    return `?${p.toString()}`;
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/account" className="text-sm text-primary hover:underline">
            ← Mon compte
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Mes achats</h1>
          <p className="text-sm text-ink-2">
            {total ? `${total.toLocaleString('fr-FR')} achat${total > 1 ? 's' : ''}` : 'Votre historique d’achats et le suivi de livraison dans vos jeux.'}
          </p>
        </div>
        <Link href="/legal/retractation" className="text-sm text-primary hover:underline">
          Vos droits de rétractation
        </Link>
      </div>

      {withdrawnId && (
        <p role="status" className="mb-4 rounded-[var(--radius)] border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ink">
          Rétractation enregistrée{withdrawn ? ` pour « ${withdrawn.itemTitle} »` : ''} : la livraison est annulée et vous êtes remboursé
          intégralement, par le même moyen de paiement (sous 14 jours au plus, généralement quelques jours selon votre banque). Un accusé de
          réception vous est envoyé par e-mail.
        </p>
      )}
      {withdrawalError && (
        <p role="alert" className="mb-4 rounded-[var(--radius)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ink">
          {withdrawalError}
        </p>
      )}

      {confirming && (
        <section aria-labelledby="withdraw-title" className="mb-5 rounded-[var(--radius)] border border-warn/40 bg-warn/10 p-5">
          <h2 id="withdraw-title" className="text-base font-semibold text-ink">
            Se rétracter de cet achat
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            « {confirming.itemTitle} »{confirming.quantity > 1 ? ` ×${confirming.quantity}` : ''} — {confirming.gameName}, acheté le{' '}
            {formatDateTime(confirming.date)} pour {formatMoney(confirming.amountCents, confirming.currency)}.
          </p>
          <p className="mt-2 text-sm text-ink-2">
            L’achat n’a pas encore été livré dans le jeu : en confirmant, la livraison est annulée et vous êtes remboursé de{' '}
            {formatMoney(confirming.amountCents, confirming.currency)}.
          </p>
          <form action={confirmWithdrawal} className="mt-4 flex flex-wrap justify-end gap-3">
            <input type="hidden" name="orderId" value={confirming.id} />
            <Link href={withPage({})} className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 text-sm hover:bg-bg">
              Annuler
            </Link>
            <button type="submit" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:opacity-90">
              Confirmer la rétractation
            </button>
          </form>
        </section>
      )}

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-line bg-surface p-10 text-center">
          <p className="font-medium">Aucun achat pour l’instant.</p>
          <p className="mt-1 text-sm text-ink-2">Vos achats apparaîtront ici, avec leur statut de livraison dans le jeu.</p>
          <Link href="/" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Trouver mon jeu
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius)] border border-line bg-surface">
          {rows.map((p) => {
            const s = playerDeliveryLabel(p.orderStatus, p.deliveryStatus);
            return (
              <li key={p.id} className="flex items-center gap-4 px-4 py-3">
                {p.gameIconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.gameIconUrl} alt="" className="size-11 shrink-0 rounded-[22%] border border-line object-cover" />
                ) : (
                  <div className="size-11 shrink-0 rounded-[22%] bg-brand" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {p.itemTitle}
                    {p.quantity > 1 && <span className="text-ink-3"> ×{p.quantity}</span>}
                  </div>
                  <div className="truncate text-sm text-ink-2">
                    <Link href={`/games/${p.gameSlug}`} className="hover:underline">
                      {p.gameName}
                    </Link>{' '}
                    · {formatDateTime(p.date)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`font-semibold tabular-nums ${p.orderStatus === 'refunded' ? 'text-ink-3 line-through' : ''}`}>
                    {formatMoney(p.amountCents, p.currency)}
                  </span>
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[s.tone]}`}>{s.label}</span>
                  {withdrawable.has(p.id) && (
                    <Link
                      href={withPage({ withdraw: p.id })}
                      className="inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Me rétracter
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Pagination">
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

      <p className="mt-6 text-xs text-ink-3">
        Un achat marqué « Échec — contactez le support » n’a pas pu être crédité dans le jeu : contactez le support en indiquant le jeu et la date de l’achat.
      </p>
    </main>
  );
}
