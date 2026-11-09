import Link from 'next/link';
import { listStudiosForAdmin, requireAdminPermission } from '@/server/admin';
import { normalizeQuery } from '@/server/admin-logic';
import { Empty, PageHeader, SearchForm, StripeBadge } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Studios' };

export default async function AdminStudios({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminPermission('studios.read');
  const q = normalizeQuery((await searchParams).q);
  const rows = await listStudiosForAdmin(q);

  return (
    <>
      <PageHeader title="Studios" />
      <div className="mb-4">
        <SearchForm action="/admin/studios" defaultValue={q} label="Rechercher un studio" placeholder="Nom, slug ou id" />
      </div>
      {rows.length ? (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-black/5">
          {rows.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/studios/${s.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-bg focus-visible:bg-bg">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-ink-2">
                    {s.members} membre{s.members > 1 ? 's' : ''} · {s.games} jeu{s.games > 1 ? 'x' : ''} · {s.slug}
                  </span>
                </span>
                <StripeBadge accountId={s.stripeAccountId} chargesEnabled={s.chargesEnabled} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Aucun studio ne correspond.</Empty>
      )}
    </>
  );
}
