import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatMoney } from '@wolleen/core';
import { getGameForAdmin, requireAdminPermission } from '@/server/admin';
import { MODERATION_ACTION_LABELS, SUSPENSION_GROUNDS, can, type SuspensionGround } from '@/server/admin-logic';
import { Card, DELIVERY_STATUS, Facts, GameStatusBadge, Mono, PageHeader, TableWrap, Time, td, th } from '@/components/admin/ui';
import { ModerationPanel } from '@/components/admin/ModerationPanel';
import { AuditList } from '@/components/admin/AuditList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fiche jeu' };

const LINK_METHODS: Record<string, string> = { code: 'Code affiché dans le jeu', id_confirm: 'Confirmation de l’ID joueur', oauth: 'OAuth' };

export default async function AdminGame({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission('games.read');
  const data = await getGameForAdmin((await params).id);
  if (!data) notFound();
  const { game, items, sales30, deliveriesByStatus, notices, audit } = data;

  return (
    <>
      <PageHeader title={game.name} crumbs={[{ href: '/admin/games', label: 'Jeux' }]}>
        <div className="flex items-center gap-2">
          <GameStatusBadge status={game.status} />
          {game.status === 'live' ? (
            <Link href={`/games/${game.slug}`} className="text-sm text-primary hover:underline">
              Voir la boutique
            </Link>
          ) : null}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card title="Jeu">
            <Facts
              rows={[
                ['Identifiant', <Mono key="id">{game.id}</Mono>],
                ['Slug', <Mono key="slug">{game.slug}</Mono>],
                ['Studio', <Link key="s" href={`/admin/studios/${game.studioId}`} className="text-primary hover:underline">{game.studioName}</Link>],
                ['Éditeur affiché', game.publisherName || '—'],
                ['Catégorie', game.category],
                ['Devise', game.currency],
                ['Créé le', <Time key="c" date={game.createdAt} />],
                ['Ventes 30 j', `${formatMoney(sales30.gmvCents, game.currency)} · ${sales30.orders} commande${sales30.orders > 1 ? 's' : ''}`],
              ]}
            />
            {game.description ? <p className="mt-4 whitespace-pre-line border-t border-line pt-3 text-sm text-ink-2">{game.description}</p> : null}
          </Card>

          <Card title={`Articles (${items.length})`}>
            {items.length ? (
              <TableWrap label="Articles du jeu">
                <thead>
                  <tr>
                    <th className={th}>Article</th>
                    <th className={th}>Product ID</th>
                    <th className={th}>Type</th>
                    <th className={`${th} text-right`}>Prix</th>
                    <th className={th}>Actif</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td className={td}>{it.title}</td>
                      <td className={td}><Mono>{it.productId}</Mono></td>
                      <td className={td}>{it.type}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatMoney(it.priceCents, game.currency)}</td>
                      <td className={td}>{it.active ? 'Oui' : <span className="text-ink-3">Non</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            ) : (
              <p className="text-sm text-ink-2">Aucun article.</p>
            )}
          </Card>

          <Card title="Intégration">
            <Facts
              rows={[
                ['Liaison', game.linkMethods.map((m) => LINK_METHODS[m] ?? m).join(', ') || '—'],
                ['Webhook', game.webhookUrl ? <Mono key="w">{game.webhookUrl}</Mono> : 'Aucun (SDK uniquement)'],
                ['Player lookup', game.playerLookupUrl ? <Mono key="l">{game.playerLookupUrl}</Mono> : '—'],
                ['Clé API', <span key="k"><Mono>{game.apiKeyPrefix}…</Mono> <span className="text-xs text-ink-3">(préfixe seul ; les secrets ne sont jamais affichés)</span></span>],
                [
                  'Livraisons',
                  <span key="d" className="flex flex-wrap gap-x-3 gap-y-1">
                    {(['pending', 'delivered', 'acknowledged', 'failed'] as const).map((s) => (
                      <span key={s} className={s === 'failed' && deliveriesByStatus.failed ? 'font-semibold text-danger' : ''}>
                        {DELIVERY_STATUS[s].label} : {deliveriesByStatus[s] ?? 0}
                      </span>
                    ))}
                  </span>,
                ],
              ]}
            />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Modération">
            <ModerationPanel gameId={game.id} status={game.status} canModerate={can(admin.role, 'games.moderate')} />
          </Card>
          <Card title="Décisions communiquées au studio">
            {notices.length ? (
              <ol className="flex flex-col gap-3">
                {notices.map((n) => (
                  <li key={n.id} className="rounded-xl bg-bg p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>{MODERATION_ACTION_LABELS[n.action]}</strong>
                      <span className="text-xs text-ink-2"><Time date={n.createdAt} /></span>
                    </div>
                    {n.ground ? <p className="mt-1 text-xs text-ink-2">Fondement : {SUSPENSION_GROUNDS[n.ground as SuspensionGround] ?? n.ground}</p> : null}
                    {n.reason ? <p className="mt-1 whitespace-pre-line break-words">{n.reason}</p> : null}
                    <p className={`mt-2 text-xs ${n.notifiedAt ? 'text-ok' : 'text-danger'}`}>
                      {n.notifiedAt ? `E-mail envoyé à ${n.notifiedTo}` : `E-mail non envoyé${n.notifyError ? ` : ${n.notifyError}` : ''}`}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-3">Réf. {n.id}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-2">Aucune décision.</p>
            )}
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
