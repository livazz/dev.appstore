import Link from 'next/link';
import { formatMoney } from '@wolleen/core';
import { requireUser } from '@/server/session';
import { getPlayerPurchases } from '@/server/analytics';
import { formatDateTime, playerDeliveryLabel, TONE_CLASSES } from '@/lib/analytics-format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes achats — Wolleen' };

const PAGE_SIZE = 25;

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser('/account/purchases');
  const raw = (await searchParams).page;
  const page = Math.max(1, Math.floor(Number(Array.isArray(raw) ? raw[0] : raw)) || 1);
  const { rows, total } = await getPlayerPurchases(user.id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
      </div>

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
