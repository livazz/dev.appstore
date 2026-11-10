import Link from 'next/link';
import { Suspense } from 'react';
import { CatalogSkeleton } from '@/components/catalog/Skeletons';
import { GameCard } from '@/components/catalog/GameCard';
import { PromoRail } from '@/components/catalog/PromoRail';
import { RankedGameRow } from '@/components/catalog/RankingList';
import { getHomeCatalog, getPromoItems, normalizePlatform, type GamePlatform } from '@/server/catalog';
import { getGameRanking } from '@/server/rankings';
import { getSpotlights } from '@/server/spotlight';
import { SpotlightSection } from '@/components/catalog/SpotlightSection';
import { openGraph } from '@/lib/seo';
import { SiteArt, type SiteArtName } from '@/components/SiteArt';

export const dynamic = 'force-dynamic';

export const metadata = { alternates: { canonical: '/' }, openGraph: openGraph({ url: '/' }) };

type Props = { searchParams: Promise<{ plateforme?: string | string[] }> };

const PLATFORMS: { id: GamePlatform | null; label: string }[] = [
  { id: null, label: 'Tout' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'pc', label: 'PC' },
];

/** Le bandeau s'affiche tout de suite ; le catalogue (requêtes DB) arrive en streaming derrière un squelette. */
export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams;
  const platform = normalizePlatform(Array.isArray(sp.plateforme) ? sp.plateforme[0] : sp.plateforme);
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <section className="relative mt-6 overflow-hidden rounded-[18px] bg-ink bg-[radial-gradient(ellipse_at_85%_40%,#4b2a8a_0%,transparent_60%)] px-6 py-10 text-white sm:mt-8 sm:px-10 sm:py-14">
        <SiteArt name="hero" priority className="pointer-events-none absolute top-1/2 -right-6 hidden w-[44%] max-w-[480px] -translate-y-1/2 md:block" />
        <div className="relative md:max-w-[56%]">
          <p className="text-sm font-semibold tracking-wide text-brand uppercase">Achats in-app sur le web</p>
          <h1 className="mt-2 max-w-2xl text-3xl leading-tight font-bold sm:text-5xl">Vos jeux préférés, moins cher qu’en jeu</h1>
          <p className="mt-4 max-w-xl text-base text-white/75 sm:text-lg">
            Trouvez votre jeu, liez votre compte une fois, achetez : vos objets arrivent automatiquement dans le jeu.
          </p>
        </div>
        <ol className="relative mt-8 grid gap-3 text-sm sm:grid-cols-3 sm:gap-4 md:max-w-[62%]">
          {(
            [
              ['Cherchez votre jeu', 'step-search'],
              ['Liez votre compte de jeu', 'step-link'],
              ['Achetez, c’est livré', 'step-delivered'],
            ] as [string, SiteArtName][]
          ).map(([step, art], i) => (
            <li key={step} className="flex items-center gap-3 rounded-2xl bg-white/[0.07] p-2 pr-3 ring-1 ring-white/10">
              <SiteArt name={art} priority className="size-14 flex-none" />
              <span>
                <span className="block text-xs font-bold text-brand">Étape {i + 1}</span>
                {step}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <nav aria-label="Plateforme" className="mt-8 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-line bg-surface p-1">
          {PLATFORMS.map((p) => {
            const active = p.id === platform;
            return (
              <Link
                key={p.label}
                href={p.id ? `/?plateforme=${p.id}` : '/'}
                scroll={false}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-10 min-w-16 items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  active ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {p.label}
              </Link>
            );
          })}
        </div>
        <Link
          href="/classements"
          className="ml-auto inline-flex min-h-11 items-center gap-1 rounded px-1 text-sm font-semibold text-[color-mix(in_srgb,var(--primary)_55%,black)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Voir les classements <span aria-hidden="true">→</span>
        </Link>
      </nav>

      <Suspense key={platform ?? 'tout'} fallback={<CatalogSkeleton />}>
        <Catalog platform={platform} />
      </Suspense>
    </div>
  );
}

/** Identifiant HTML valide pour aria-labelledby (« Battle royale » contient une espace). */
const categoryId = (c: string) => `cat-${c.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}`;

const linkCls =
  '-my-3 inline-flex min-h-11 items-center rounded px-1 text-sm font-semibold text-[color-mix(in_srgb,var(--primary)_55%,black)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

async function Catalog({ platform }: { platform: GamePlatform | null }) {
  const now = new Date();
  const [{ featured, categories, total }, promos, topMobile, topPc, spotlights] = await Promise.all([
    getHomeCatalog(undefined, { platform }),
    getPromoItems({ platform, now }),
    platform === 'pc' ? Promise.resolve([]) : getGameRanking({ platform: 'mobile', limit: 10, now }),
    platform === 'mobile' ? Promise.resolve([]) : getGameRanking({ platform: 'pc', limit: 10, now }),
    getSpotlights({ platform, limit: 7, now }),
  ]);
  const tops = [
    { id: 'top-mobile', title: 'Top 10 mobile', href: '/classements/mobile', list: topMobile },
    { id: 'top-pc', title: 'Top 10 PC', href: '/classements/pc', list: topPc },
  ].filter((t) => t.list.length > 0);
  return (
    <>
      {total === 0 ? (
        <div className="mt-12 rounded-[var(--radius)] bg-surface p-8 text-center">
          <p className="font-semibold">{platform ? `Aucun jeu ${platform === 'pc' ? 'PC' : 'mobile'} pour l’instant` : 'Aucun jeu n’est encore disponible'}</p>
          <p className="mt-1 text-sm text-ink-2">Les premières boutiques arrivent bientôt. Revenez nous voir !</p>
        </div>
      ) : (
        <>
          <SpotlightSection entries={spotlights} />

          <PromoRail
            id="promos-du-jour"
            title="Promos du jour"
            subtitle="Offres à durée limitée : profitez-en avant la fin du compte à rebours."
            items={promos.live}
            now={now.getTime()}
          />
          <PromoRail id="bientot-en-promo" title="Bientôt en promo" subtitle="Les prochaines réductions, à ne pas manquer." items={promos.upcoming} now={now.getTime()} upcoming />

          {tops.length > 0 && (
            <div className={`mt-10 grid gap-6 ${tops.length > 1 ? 'lg:grid-cols-2' : ''}`}>
              {tops.map((t) => (
                <section key={t.id} aria-labelledby={t.id} className="min-w-0 rounded-[16px] bg-surface p-3 sm:p-4">
                  <div className="flex items-baseline justify-between gap-4 px-2">
                    <h2 id={t.id} className="text-xl font-bold sm:text-2xl">
                      {t.title}
                    </h2>
                    <Link href={t.href} className={linkCls} aria-label={`Voir le classement complet : ${t.title.replace('10', '100')}`}>
                      Top 100
                    </Link>
                  </div>
                  <ol className={`mt-2 gap-x-4 ${tops.length === 1 ? 'md:columns-2' : ''}`}>
                    {t.list.map((r) => (
                      <li key={r.entry.id} className="min-w-0 break-inside-avoid">
                        <RankedGameRow r={r} compact />
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          )}

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
                <Link href={`/search?cat=${encodeURIComponent(row.category)}`} className={linkCls} aria-label={`Tout voir : ${row.category}`}>
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
