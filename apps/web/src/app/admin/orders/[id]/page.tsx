import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatMoney } from '@devappstore/core';
import { getOrderForAdmin, requireAdminPermission } from '@/server/admin';
import { can } from '@/server/admin-logic';
import { Card, DeliveryStatusBadge, Facts, Mono, OrderStatusBadge, PageHeader, TableWrap, Time, td, th } from '@/components/admin/ui';
import { AuditList } from '@/components/admin/AuditList';
import { RetryDeliveryForm } from '@/components/admin/RetryDeliveryForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Commande' };

export default async function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission('orders.read');
  const data = await getOrderForAdmin((await params).id);
  if (!data) notFound();
  const { order, buyer, game, delivery, attempts, audit } = data;
  const retryable = !!delivery && (delivery.status === 'pending' || delivery.status === 'failed');

  return (
    <>
      <PageHeader title={`Commande ${order.id}`} crumbs={[{ href: '/admin/orders', label: 'Commandes' }]}>
        <OrderStatusBadge status={order.status} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card title="Commande">
            <Facts
              rows={[
                ['Article', `${order.itemTitle} × ${order.quantity}`],
                ['Product ID', <Mono key="p">{order.productId}</Mono>],
                ['Jeu', <Link key="g" href={`/admin/games/${game.id}`} className="text-primary hover:underline">{game.name}</Link>],
                ['Montant', formatMoney(order.amountCents, order.currency)],
                ['Commission', formatMoney(order.platformFeeCents, order.currency)],
                [
                  'Acheteur',
                  can(admin.role, 'users.read') ? (
                    <Link key="b" href={`/admin/users/${buyer.id}`} className="text-primary hover:underline">{buyer.email}</Link>
                  ) : (
                    buyer.email
                  ),
                ],
                ['Player ID', <Mono key="pl">{order.playerId}</Mono>],
                ['Créée le', <Time key="c" date={order.createdAt} />],
                ['Payée le', <Time key="pa" date={order.paidAt} />],
                ['Stripe', order.stripePaymentIntentId ? <Mono key="s">{order.stripePaymentIntentId}</Mono> : order.stripeCheckoutSessionId ? <Mono key="s">{order.stripeCheckoutSessionId}</Mono> : '—'],
              ]}
            />
          </Card>

          <Card title={`Tentatives webhook (${attempts.length})`}>
            {!game.webhookUrl ? <p className="mb-3 text-sm text-ink-2">Ce jeu n’a pas de webhook : la livraison est récupérée par le SDK.</p> : null}
            {attempts.length ? (
              <TableWrap label="Tentatives webhook">
                <thead>
                  <tr>
                    <th className={th}>Date</th>
                    <th className={th}>Statut HTTP</th>
                    <th className={th}>Durée</th>
                    <th className={th}>Erreur</th>
                    <th className={th}>URL</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((a) => {
                    const ok = a.statusCode !== null && a.statusCode >= 200 && a.statusCode < 300;
                    return (
                      <tr key={a.id}>
                        <td className={`${td} whitespace-nowrap`}><Time date={a.createdAt} /></td>
                        <td className={`${td} font-semibold ${ok ? 'text-ok' : 'text-danger'}`}>{a.statusCode ?? '—'}</td>
                        <td className={`${td} tabular-nums`}>{a.durationMs != null ? `${a.durationMs} ms` : '—'}</td>
                        <td className={`${td} break-words`}>{a.error ?? '—'}</td>
                        <td className={td}><Mono>{a.url}</Mono></td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            ) : (
              <p className="text-sm text-ink-2">Aucune tentative enregistrée.</p>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Livraison" actions={<DeliveryStatusBadge status={delivery?.status ?? null} />}>
            {delivery ? (
              <Facts
                rows={[
                  ['Identifiant', <Mono key="i">{delivery.id}</Mono>],
                  ['Tentatives', String(delivery.attempts)],
                  ['Dernière erreur', delivery.lastError ? <span key="e" className="text-danger">{delivery.lastError}</span> : '—'],
                  ['Prochain essai', <Time key="n" date={delivery.nextAttemptAt} />],
                  ['Livrée le', <Time key="d" date={delivery.deliveredAt} />],
                  ['Confirmée le', <Time key="a" date={delivery.acknowledgedAt} />],
                ]}
              />
            ) : (
              <p className="text-sm text-ink-2">Aucune livraison (la commande n’est pas payée).</p>
            )}
            {delivery && can(admin.role, 'orders.retry_delivery') ? (
              <div className="mt-4 border-t border-line pt-4">
                <RetryDeliveryForm orderId={order.id} retryable={retryable} />
              </div>
            ) : null}
          </Card>
          {can(admin.role, 'audit.read') ? (
            <Card title="Journal">
              <AuditList rows={audit} compact />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
