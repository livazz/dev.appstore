import Link from 'next/link';
import { formatMoney } from '@wolleen/core';
import { requireAdminPermission, searchOrdersForAdmin } from '@/server/admin';
import { normalizeQuery } from '@/server/admin-logic';
import { DeliveryStatusBadge, Empty, OrderStatusBadge, PageHeader, SearchForm, Time } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Commandes' };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminPermission('orders.read');
  const q = normalizeQuery((await searchParams).q);
  const rows = await searchOrdersForAdmin(q);

  return (
    <>
      <PageHeader title="Commandes" />
      <div className="mb-2">
        <SearchForm action="/admin/orders" defaultValue={q} label="Rechercher une commande" placeholder="Id de commande, e-mail ou player_id" />
      </div>
      <p className="mb-4 text-xs text-ink-2">
        {q ? `${rows.length} résultat${rows.length > 1 ? 's' : ''} pour « ${q} »${rows.length >= 50 ? ' (50 premiers)' : ''}.` : '50 commandes les plus récentes.'}
      </p>
      {rows.length ? (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-black/5">
          {rows.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-bg focus-visible:bg-bg">
                <span className="min-w-0 flex-1 basis-56">
                  <span className="block truncate font-medium">
                    {o.itemTitle} <span className="font-normal text-ink-2">· {o.gameName}</span>
                  </span>
                  <span className="block truncate text-xs text-ink-2">
                    {o.email} · joueur {o.playerId} · <Time date={o.createdAt} />
                  </span>
                  <span className="block truncate font-mono text-[11px] text-ink-3">{o.id}</span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums">{formatMoney(o.amountCents, o.currency)}</span>
                  <OrderStatusBadge status={o.status} />
                  {o.status === 'paid' || o.deliveryStatus ? <DeliveryStatusBadge status={o.deliveryStatus} /> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Aucune commande ne correspond à « {q} ».</Empty>
      )}
    </>
  );
}
