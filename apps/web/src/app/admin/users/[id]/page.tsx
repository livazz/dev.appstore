import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUserForAdmin, requireAdminPermission } from '@/server/admin';
import { ADMIN_ROLE_LABELS, can } from '@/server/admin-logic';
import { Badge, Card, Facts, Mono, PageHeader, Time } from '@/components/admin/ui';
import { AuditList } from '@/components/admin/AuditList';
import { UserStatusForm } from '@/components/admin/UserStatusForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Utilisateur' };

const ROLE_LABELS: Record<string, string> = { owner: 'Propriétaire', admin: 'Admin', developer: 'Développeur', finance: 'Finance' };

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission('users.read');
  const data = await getUserForAdmin((await params).id);
  if (!data) notFound();
  const { user: u, memberships, orders, links, sessions, audit } = data;
  const isSelf = u.id === admin.user.id;
  const protectedAdmin = !!u.adminRole && admin.role !== 'superadmin';

  return (
    <>
      <PageHeader title={u.name} crumbs={[{ href: '/admin/users', label: 'Utilisateurs' }]}>
        <div className="flex gap-2">
          {u.adminRole ? <Badge label={`Admin · ${ADMIN_ROLE_LABELS[u.adminRole]}`} cls="bg-brand/30 text-ink ring-brand" /> : null}
          {u.disabledAt ? <Badge label="Désactivé" cls="bg-danger/10 text-danger ring-danger/30" /> : <Badge label="Actif" cls="bg-ok/10 text-ok ring-ok/30" />}
        </div>
      </PageHeader>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card title="Compte">
            <Facts
              rows={[
                ['Identifiant', <Mono key="id">{u.id}</Mono>],
                ['E-mail', `${u.email}${u.emailVerified ? ' (vérifié)' : ''}`],
                ['Inscrit le', <Time key="c" date={u.createdAt} />],
                ['Commandes', <Link key="o" href={`/admin/orders?q=${encodeURIComponent(u.email)}`} className="text-primary hover:underline">{orders}</Link>],
                ['Jeux liés', String(links)],
                ['Sessions actives', String(sessions)],
              ]}
            />
          </Card>
          <Card title="Studios">
            {memberships.length ? (
              <ul className="flex flex-col divide-y divide-line">
                {memberships.map((m) => (
                  <li key={m.studioId} className="flex items-center gap-3 py-2 text-sm">
                    <Link href={`/admin/studios/${m.studioId}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                      {m.studioName}
                    </Link>
                    <Badge label={ROLE_LABELS[m.role] ?? m.role} cls="bg-bg text-ink-2 ring-line" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">Membre d’aucun studio.</p>
            )}
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Card title={u.disabledAt ? 'Compte désactivé' : 'Désactivation'}>
            {u.disabledAt ? (
              <div className="mb-4 rounded-xl bg-danger/10 p-3 text-sm">
                <p>
                  Depuis le <Time date={u.disabledAt} />
                </p>
                <p className="mt-1 whitespace-pre-line break-words">{u.disabledReason}</p>
              </div>
            ) : null}
            {!can(admin.role, 'users.disable') ? (
              <p className="text-sm text-ink-2">Votre rôle ne permet pas de modifier ce compte.</p>
            ) : isSelf ? (
              <p className="text-sm text-ink-2">Vous ne pouvez pas désactiver votre propre compte.</p>
            ) : protectedAdmin ? (
              <p className="text-sm text-ink-2">Seul un superadmin peut modifier le compte d’un administrateur.</p>
            ) : (
              <UserStatusForm userId={u.id} disabled={!!u.disabledAt} />
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
