import Link from 'next/link';
import { Suspense } from 'react';
import { CatalogSkeleton } from '@/components/catalog/Skeletons';
import { GameCard } from '@/components/catalog/GameCard';
import { getHomeCatalog } from '@/server/catalog';

export const dynamic = 'force-dynamic';

/** Le bandeau s'affiche tout de suite ; le catalogue (requêtes DB) arrive en streaming derrière un squelette. */
export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <section className="mt-6 overflow-hidden rounded-[18px] bg-ink px-6 py-10 text-white sm:mt-8 sm:px-10 sm:py-14">
        <p className="text-sm font-semibold tracking-wide text-brand uppercase">Achats in-app sur le web</p>
        <h1 className="mt-2 max-w-2xl text-3xl leading-tight font-bold sm:text-5xl">Vos jeux préférés, moins cher qu’en jeu</h1>
        <p className="mt-4 max-w-xl text-base text-white/75 sm:text-lg">
          Trouvez votre jeu, liez votre compte une fois, achetez : vos objets arrivent automatiquement dans le jeu.
        </p>
        <ol className="mt-8 flex flex-col gap-3 text-sm sm:flex-row sm:gap-8">
          {['Cherchez votre jeu', 'Liez votre compte de jeu', 'Achetez, c’est livré'].map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              <span className="grid size-7 flex-none place-items-center rounded-full bg-brand font-bold text-ink">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <Suspense fallback={<CatalogSkeleton />}>
        <Catalog />
      </Suspense>
    </div>
  );
}

/** Identifiant HTML valide pour aria-labelledby (« Battle royale » contient une espace). */
const categoryId = (c: string) => `cat-${c.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}`;

async function Catalog() {
  const { featured, categories, total } = await getHomeCatalog();
  return (
    <>
      {total === 0 ? (
        <div className="mt-12 rounded-[var(--radius)] bg-surface p-8 text-center">
          <p className="font-semibold">Aucun jeu n’est encore disponible</p>
          <p className="mt-1 text-sm text-ink-2">Les premières boutiques arrivent bientôt. Revenez nous voir !</p>
        </div>
      ) : (
        <>
          {featured.length > 0 && (
            <section className="mt-10" aria-labelledby="featured-title">
              <h2 id="featured-title" className="text-xl font-bold sm:text-2xl">
                À la une
              </h2>
              <div className="mt-4 grid gap-2 rounded-[var(--radius)] bg-surface/60 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((g) => (
                  <GameCard key={g.id} game={g} variant="row" />
                ))}
              </div>
            </section>
          )}

          {categories.map((row) => (
            <section key={row.category} className="mt-10" aria-labelledby={categoryId(row.category)}>
              <div className="flex items-baseline justify-between gap-4">
                <h2 id={categoryId(row.category)} className="text-xl font-bold sm:text-2xl">
                  {row.category}
                </h2>
                <Link
                  href={`/search?cat=${encodeURIComponent(row.category)}`}
                  className="-my-3 inline-flex min-h-11 items-center rounded px-1 text-sm font-semibold text-[color-mix(in_srgb,var(--primary)_55%,black)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  aria-label={`Tout voir : ${row.category}`}
                >
                  Tout voir
                </Link>
              </div>
              <div className="-mx-4 mt-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                {row.games.map((g) => (
                  <GameCard key={g.id} game={g} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
