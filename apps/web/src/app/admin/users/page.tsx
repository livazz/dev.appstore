import Link from 'next/link';
import { requireAdminPermission, searchUsersForAdmin } from '@/server/admin';
import { ADMIN_ROLE_LABELS, normalizeQuery } from '@/server/admin-logic';
import { Badge, Empty, PageHeader, SearchForm, Time } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Utilisateurs' };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminPermission('users.read');
  const q = normalizeQuery((await searchParams).q);
  const rows = await searchUsersForAdmin(q);

  return (
    <>
      <PageHeader title="Utilisateurs" />
      <div className="mb-2">
        <SearchForm action="/admin/users" defaultValue={q} label="Rechercher un utilisateur" placeholder="E-mail, nom ou id" />
      </div>
      <p className="mb-4 text-xs text-ink-2">{q ? `${rows.length} résultat${rows.length > 1 ? 's' : ''}${rows.length >= 50 ? ' (50 premiers)' : ''}.` : '50 comptes les plus récents.'}</p>
      {rows.length ? (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-black/5">
          {rows.map((u) => (
            <li key={u.id}>
              <Link href={`/admin/users/${u.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-bg focus-visible:bg-bg">
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block truncate font-medium">{u.name}</span>
                  <span className="block truncate text-xs text-ink-2">
                    {u.email} · inscrit le <Time date={u.createdAt} withTime={false} />
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  {u.adminRole ? <Badge label={`Admin · ${ADMIN_ROLE_LABELS[u.adminRole]}`} cls="bg-brand/30 text-ink ring-brand" /> : null}
                  {u.disabledAt ? <Badge label="Désactivé" cls="bg-danger/10 text-danger ring-danger/30" /> : <Badge label="Actif" cls="bg-ok/10 text-ok ring-ok/30" />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Aucun utilisateur ne correspond à « {q} ».</Empty>
      )}
    </>
  );
}
