import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatMoney } from '@wolleen/core';
import { getStudioForAdmin, requireAdminPermission } from '@/server/admin';
import { can } from '@/server/admin-logic';
import { Badge, Card, Facts, GameStatusBadge, Mono, PageHeader, StripeBadge, Time } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fiche studio' };

const ROLE_LABELS: Record<string, string> = { owner: 'Propriétaire', admin: 'Admin', developer: 'Développeur', finance: 'Finance' };

export default async function AdminStudio({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission('studios.read');
  const data = await getStudioForAdmin((await params).id);
  if (!data) notFound();
  const { studio, members, games, sales30 } = data;
  const canSeeUsers = can(admin.role, 'users.read');

  return (
    <>
      <PageHeader title={studio.name} crumbs={[{ href: '/admin/studios', label: 'Studios' }]} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Studio">
          <Facts
            rows={[
              ['Identifiant', <Mono key="id">{studio.id}</Mono>],
              ['Slug', <Mono key="slug">{studio.slug}</Mono>],
              ['Créé le', <Time key="c" date={studio.createdAt} />],
              [
                'Ventes 30 j',
                sales30.length
                  ? sales30.map((s) => `${formatMoney(s.gmvCents, s.currency)} (commission ${formatMoney(s.feeCents, s.currency)}, ${s.orders} cmd)`).join(' · ')
                  : 'Aucune vente',
              ],
            ]}
          />
        </Card>
        <Card title="Compte Stripe Connect">
          <Facts
            rows={[
              ['État', <StripeBadge key="s" accountId={studio.stripeAccountId} chargesEnabled={studio.stripeChargesEnabled} />],
              ['Compte', studio.stripeAccountId ? <Mono key="a">{studio.stripeAccountId}</Mono> : '—'],
              ['Paiements', studio.stripeChargesEnabled ? 'Activés' : 'Non activés (onboarding à terminer côté studio)'],
            ]}
          />
        </Card>
        <Card title={`Membres (${members.length})`}>
          <ul className="flex flex-col divide-y divide-line">
            {members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  {canSeeUsers ? (
                    <Link href={`/admin/users/${m.userId}`} className="block truncate font-medium hover:underline">
                      {m.name}
                    </Link>
                  ) : (
                    <span className="block truncate font-medium">{m.name}</span>
                  )}
                  <span className="block truncate text-xs text-ink-2">{m.email}</span>
                </span>
                {m.disabledAt ? <Badge label="Désactivé" cls="bg-danger/10 text-danger ring-danger/30" /> : null}
                <Badge label={ROLE_LABELS[m.role] ?? m.role} cls="bg-bg text-ink-2 ring-line" />
              </li>
            ))}
          </ul>
        </Card>
        <Card title={`Jeux (${games.length})`}>
          {games.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {games.map((g) => (
                <li key={g.id}>
                  <Link href={`/admin/games/${g.id}`} className="flex items-center gap-3 py-2 text-sm hover:underline">
                    <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
                    <GameStatusBadge status={g.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">Aucun jeu.</p>
          )}
        </Card>
      </div>
    </>
  );
}
