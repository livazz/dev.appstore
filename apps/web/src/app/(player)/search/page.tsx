import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney, GAME_CATEGORIES } from '@devappstore/core';
import { DiscountBadge, GameCard, GameIcon } from '@/components/catalog/GameCard';
import { safeImageUrl } from '@/components/store/style-safety';
import { discountPct, searchCatalog } from '@/server/catalog';
import { SiteArt } from '@/components/SiteArt';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ q?: string | string[]; cat?: string | string[] }> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const q = first(sp.q).trim();
  const cat = first(sp.cat).trim();
  return {
    title: q ? `Recherche « ${q} »` : cat ? `Jeux ${cat}` : 'Rechercher',
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const res = await searchCatalog({ q: first(sp.q), cat: first(sp.cat) });
  const empty = !res.q && !res.category;
  const nothing = !empty && res.games.length === 0 && res.items.length === 0;

  const heading = res.q ? `Résultats pour « ${res.q} »` : res.category ? res.category : 'Rechercher';

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6">
      <h1 className="text-2xl font-bold break-words sm:text-3xl">{heading}</h1>
      {res.q && res.category && <p className="mt-1 text-ink-2">dans la catégorie {res.category}</p>}

      <nav aria-label="Catégories" className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {[null, ...GAME_CATEGORIES].map((c) => {
          const active = (c ?? null) === res.category;
          const p = new URLSearchParams();
          if (res.q) p.set('q', res.q);
          if (c) p.set('cat', c);
          return (
            <Link
              key={c ?? 'all'}
              href={`/search?${p.toString()}`}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-11 flex-none items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2 hover:border-ink-2 hover:text-ink'
              }`}
            >
              {c ?? 'Toutes catégories'}
            </Link>
          );
        })}
      </nav>

      {empty && (
        <div className="mt-10 rounded-[var(--radius)] bg-surface p-8 text-center">
          <p className="font-semibold">Que cherchez-vous ?</p>
          <p className="mt-1 text-sm text-ink-2">Saisissez le nom d’un jeu, d’un éditeur ou d’un article, ou choisissez une catégorie.</p>
        </div>
      )}
      {nothing && (
        <div className="mt-10 rounded-[var(--radius)] bg-surface p-8 text-center">
          <SiteArt name="empty-search" className="mx-auto mb-3 size-36" />
          <p className="font-semibold">Aucun résultat</p>
          <p className="mt-1 text-sm text-ink-2">Essayez un autre mot-clé ou une autre catégorie.</p>
          <Link
            href="/search"
            className="mt-4 inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Effacer la recherche
          </Link>
        </div>
      )}

      {res.games.length > 0 && (
        <section className="mt-8" aria-labelledby="res-games">
          <h2 id="res-games" className="text-lg font-bold">
            Jeux <span className="font-normal text-ink-2">({res.games.length})</span>
          </h2>
          <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {res.games.map((g) => (
              <GameCard key={g.id} game={g} variant="row" />
            ))}
          </div>
        </section>
      )}

      {res.items.length > 0 && (
        <section className="mt-10" aria-labelledby="res-items">
          <h2 id="res-items" className="text-lg font-bold">
            Articles <span className="font-normal text-ink-2">({res.items.length})</span>
          </h2>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[var(--radius)] bg-surface">
            {res.items.map(({ item, game }) => {
              const pct = discountPct(item.priceCents, item.oldPriceCents);
              const img = safeImageUrl(item.models[0]?.imageUrl);
              return (
                <li key={item.id}>
                  <Link href={`/games/${game.slug}?item=${encodeURIComponent(item.id)}`} className="flex items-center gap-3 p-3 hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:gap-4">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt="" className="size-14 flex-none rounded-lg bg-bg object-contain p-1" />
                    ) : (
                      <GameIcon name={game.name} iconUrl={game.iconUrl} size={56} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{item.title}</p>
                      {item.subtitle && <p className="truncate text-sm text-ink-2">{item.subtitle}</p>}
                      <p className="truncate text-xs text-ink-2">{game.name}</p>
                    </div>
                    <div className="flex flex-none flex-col items-end gap-1">
                      <span className="font-bold">{formatMoney(item.priceCents, game.currency)}</span>
                      {pct > 0 && item.oldPriceCents != null && (
                        <span className="text-xs text-ink-2 line-through">{formatMoney(item.oldPriceCents, game.currency)}</span>
                      )}
                      <DiscountBadge pct={pct} upTo={false} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
