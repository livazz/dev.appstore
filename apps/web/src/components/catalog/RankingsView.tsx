import Link from 'next/link';
import { GAME_CATEGORIES } from '@devappstore/core';
import { normalizeCategory } from '@/server/catalog';
import { getGameRanking, getItemRanking } from '@/server/rankings';
import { RANKING_WINDOW_DAYS } from '@/server/rankings-logic';
import { RankedGameRow, RankedItemRow } from './RankingList';

export type RankingTab = 'mobile' | 'pc' | 'achats';

export const RANKING_TABS: { id: RankingTab; label: string; href: string; title: string }[] = [
  { id: 'mobile', label: 'Top 100 mobile', href: '/classements/mobile', title: 'Top 100 des jeux mobiles' },
  { id: 'pc', label: 'Top 100 PC', href: '/classements/pc', title: 'Top 100 des jeux PC' },
  { id: 'achats', label: 'Top achats', href: '/classements/achats', title: 'Top des achats' },
];

export function parseRankingTab(v: string | undefined): RankingTab | null {
  return RANKING_TABS.some((t) => t.id === v) ? (v as RankingTab) : null;
}

const chip = (active: boolean) =>
  `inline-flex min-h-11 flex-none items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
    active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2 hover:border-ink-2 hover:text-ink'
  }`;

/** Page des classements : onglets, filtre de catégorie, liste classée (100 entrées max). */
export async function RankingsView({ tab, cat }: { tab: RankingTab; cat?: string }) {
  const category = normalizeCategory(cat);
  const current = RANKING_TABS.find((t) => t.id === tab)!;
  const withCat = (href: string, c: string | null) => (c ? `${href}?cat=${encodeURIComponent(c)}` : href);

  const games = tab === 'achats' ? null : await getGameRanking({ platform: tab, category });
  const itemsRanking = tab === 'achats' ? await getItemRanking({ category }) : null;
  const count = games?.length ?? itemsRanking?.length ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6">
      <p className="text-sm font-semibold tracking-wide text-[color-mix(in_srgb,var(--brand)_45%,black)] uppercase">Classements</p>
      <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
        {current.title}
        {category && <span className="text-ink-2"> · {category}</span>}
      </h1>
      <p className="mt-1 text-sm text-ink-2">
        D’après les achats payés sur Dev AppStore ces {RANKING_WINDOW_DAYS} derniers jours. L’évolution compare au classement d’il y a une semaine.
      </p>

      <nav aria-label="Classements" className="mt-6 border-b border-line">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {RANKING_TABS.map((t) => {
            const active = t.id === tab;
            return (
              <li key={t.id} className="flex-none">
                <Link
                  href={withCat(t.href, category)}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-4 sm:text-base ${
                    active ? 'border-ink text-ink' : 'border-transparent text-ink-2 hover:text-ink'
                  }`}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav aria-label="Catégories" className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {[null, ...GAME_CATEGORIES].map((c) => {
          const active = (c ?? null) === category;
          return (
            <Link key={c ?? 'all'} href={withCat(current.href, c)} aria-current={active ? 'page' : undefined} className={chip(active)}>
              {c ?? 'Toutes catégories'}
            </Link>
          );
        })}
      </nav>

      {count === 0 ? (
        <div className="mt-8 rounded-[var(--radius)] bg-surface p-8 text-center">
          <p className="font-semibold">Pas encore de classement ici</p>
          <p className="mt-1 text-sm text-ink-2">Aucun achat sur cette période{category ? ` dans la catégorie ${category}` : ''}. Revenez bientôt !</p>
        </div>
      ) : (
        <ol className="mt-6 gap-x-6 rounded-[var(--radius)] bg-surface p-2 sm:p-3 lg:columns-2" aria-label={current.title}>
          {games?.map((r) => (
            <li key={r.entry.id} className="min-w-0 break-inside-avoid">
              <RankedGameRow r={r} />
            </li>
          ))}
          {itemsRanking?.map((r) => (
            <li key={r.entry.id} className="min-w-0 break-inside-avoid">
              <RankedItemRow r={r} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
