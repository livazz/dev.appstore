import Link from 'next/link';
import { formatMoney, type DeliveryStatus } from '@devappstore/core';
import { requireAdminPermission, searchOrdersForAdmin } from '@/server/admin';
import { normalizeQuery } from '@/server/admin-logic';
import { DELIVERY_STATUS, DeliveryStatusBadge, Empty, OrderStatusBadge, PageHeader, SearchForm, Time } from '@/components/admin/ui';

const DELIVERY_FILTERS: DeliveryStatus[] = ['failed', 'pending', 'delivered', 'acknowledged'];

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Commandes' };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ q?: string; delivery?: string }> }) {
  await requireAdminPermission('orders.read');
  const sp = await searchParams;
  const q = normalizeQuery(sp.q);
  const delivery = DELIVERY_FILTERS.includes(sp.delivery as DeliveryStatus) ? (sp.delivery as DeliveryStatus) : null;
  const rows = await searchOrdersForAdmin(q, { deliveryStatus: delivery });
  const href = (d: DeliveryStatus | null) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (d) p.set('delivery', d);
    const s = p.toString();
    return `/admin/orders${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <PageHeader title="Commandes" />
      <div className="mb-3 flex flex-col gap-3">
        <SearchForm action="/admin/orders" defaultValue={q} label="Rechercher une commande" placeholder="Id de commande, e-mail ou player_id" hidden={{ delivery: delivery ?? undefined }} />
        <nav aria-label="Filtrer par livraison" className="overflow-x-auto">
          <ul className="flex min-w-max gap-2">
            {[null, ...DELIVERY_FILTERS].map((d) => {
              const active = d === delivery;
              return (
                <li key={d ?? 'all'}>
                  <Link
                    href={href(d)}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium ring-1 ${active ? 'bg-ink text-white ring-ink' : 'bg-surface text-ink-2 ring-line hover:text-ink'}`}
                  >
                    {d ? `Livraison ${DELIVERY_STATUS[d].label.toLowerCase()}` : 'Toutes'}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      <p className="mb-4 text-xs text-ink-2">
        {q || delivery ? `${rows.length} résultat${rows.length > 1 ? 's' : ''}${q ? ` pour « ${q} »` : ''}${rows.length >= 50 ? ' (50 plus récents)' : ''}.` : '50 commandes les plus récentes.'}
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
        <Empty>Aucune commande ne correspond à ces critères.</Empty>
      )}
    </>
  );
}
