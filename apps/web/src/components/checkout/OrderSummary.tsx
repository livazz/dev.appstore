import { formatMoney } from '@wolleen/core';
import type { OrderView } from '@/server/payments';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/** Icône du jeu + récapitulatif de la commande (pages /checkout/*). */
export function OrderSummary({ view, showDate = false }: { view: OrderView; showDate?: boolean }) {
  const { order, game, playerName } = view;
  return (
    <div>
      <div className="flex items-center gap-3">
        {game.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- icônes en data: URL ou /api/uploads
          <img src={game.iconUrl} alt="" className="size-12 flex-none rounded-xl border border-line object-cover" />
        ) : (
          <span className="grid size-12 flex-none place-items-center rounded-xl bg-brand text-lg font-black text-ink" aria-hidden="true">
            {game.name.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{order.itemTitle}</p>
          <p className="truncate text-sm text-ink-2">{game.name}</p>
        </div>
      </div>

      <dl className="mt-5 divide-y divide-line rounded-[var(--radius)] border border-line text-sm">
        <Row label="Joueur">
          {playerName ? (
            <>
              {playerName} <span className="text-ink-3">· ID {order.playerId}</span>
            </>
          ) : (
            <>ID {order.playerId}</>
          )}
        </Row>
        {order.quantity > 1 && <Row label="Quantité">{order.quantity.toLocaleString('fr-FR')}</Row>}
        {showDate && <Row label="Date">{dateFmt.format(order.paidAt ?? order.createdAt)}</Row>}
        <Row label="Référence">
          <span className="font-mono text-xs">{order.id}</span>
        </Row>
        <Row label="Total" strong>
          {formatMoney(order.amountCents, order.currency)}
        </Row>
      </dl>
    </div>
  );
}

function Row({ label, strong, children }: { label: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-3 py-2">
      <dt className="text-ink-3">{label}</dt>
      <dd className={`min-w-0 truncate text-right ${strong ? 'text-base font-semibold text-ink' : 'font-medium text-ink'}`}>{children}</dd>
    </div>
  );
}
