import Link from 'next/link';
import type { GameStatus } from '@devappstore/core';
import { listGamesForAdmin, requireAdminPermission } from '@/server/admin';
import { normalizeQuery } from '@/server/admin-logic';
import { Empty, GAME_STATUS, GameStatusBadge, PageHeader, SearchForm, Time } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Jeux' };

const STATUSES: GameStatus[] = ['review', 'live', 'suspended', 'draft'];

export default async function AdminGames({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireAdminPermission('games.read');
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as GameStatus) ? (sp.status as GameStatus) : null;
  const q = normalizeQuery(sp.q);
  const { rows, counts } = await listGamesForAdmin({ status, q });
  const total = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
  const href = (s: GameStatus | null) => {
    const p = new URLSearchParams();
    if (s) p.set('status', s);
    if (q) p.set('q', q);
    const qs = p.toString();
    return `/admin/games${qs ? `?${qs}` : ''}`;
  };

  return (
    <>
      <PageHeader title="Jeux" />
      <div className="mb-4 flex flex-col gap-3">
        <nav aria-label="Filtrer par statut" className="overflow-x-auto">
          <ul className="flex min-w-max gap-2">
            {[null, ...STATUSES].map((s) => {
              const active = s === status;
              return (
                <li key={s ?? 'all'}>
                  <Link
                    href={href(s)}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1 ${active ? 'bg-ink text-white ring-ink' : 'bg-surface text-ink-2 ring-line hover:text-ink'}`}
                  >
                    {s ? GAME_STATUS[s].label : 'Tous'}
                    <span className={`tabular-nums ${active ? 'text-white/70' : 'text-ink-3'}`}>{s ? (counts[s] ?? 0) : total}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <SearchForm action="/admin/games" defaultValue={q} label="Rechercher un jeu" placeholder="Nom, slug, id ou studio" hidden={{ status: status ?? undefined }} />
      </div>

      {rows.length ? (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-black/5">
          {rows.map((g) => (
            <li key={g.id}>
              <Link href={`/admin/games/${g.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-bg focus-visible:bg-bg">
                <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-bg ring-1 ring-black/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {g.iconUrl ? <img src={g.iconUrl} alt="" className="size-full object-cover" /> : <span className="font-bold text-ink-3">{g.name[0]}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{g.name}</span>
                  <span className="block truncate text-xs text-ink-2">
                    {g.studioName} · {g.category} · {g.items} article{g.items > 1 ? 's' : ''}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <GameStatusBadge status={g.status} />
                  <span className="hidden text-xs text-ink-3 sm:block">
                    Modifié le <Time date={g.updatedAt} withTime={false} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Aucun jeu ne correspond à ces critères.</Empty>
      )}
    </>
  );
}
