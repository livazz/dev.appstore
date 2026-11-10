import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GameStore } from '@/components/catalog/GameStore';
import { ReadMore } from '@/components/catalog/ReadMore';
import { ScreenshotGallery } from '@/components/catalog/ScreenshotGallery';
import { safeImageUrl } from '@/components/store/style-safety';
import { initialStoreItem, type StoreSearchParams } from '@/components/catalog/store-query';
import { getLiveGameBySlug, maxDiscountPct } from '@/server/catalog';
import { openGraph } from '@/lib/seo';
import { GameReviews } from '@/components/reviews/GameReviews';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<StoreSearchParams> };

/** Une seule requête par rendu (partagée entre generateMetadata et la page). */
const loadGame = cache((slug: string) => getLiveGameBySlug(slug));

/** Les URL data: (visuels de démo) ne sont pas exploitables par les aperçus de liens. */
const shareable = (url: string | null) => (url && !url.startsWith('data:') ? url : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const game = await loadGame(slug);
  if (!game) return { title: 'Jeu introuvable', robots: { index: false } };
  const pct = maxDiscountPct(game.items);
  const description =
    `${game.name}${game.subtitle ? ` — ${game.subtitle}` : ''}. Achetez vos objets in-app ${pct > 0 ? `jusqu’à ${pct} % ` : ''}moins cher qu’en jeu, livrés automatiquement.` +
    (game.description ? ` ${game.description}` : '');
  const image = shareable(game.bannerUrl) ?? shareable(game.iconUrl);
  return {
    title: `${game.name} — boutique`,
    description: description.slice(0, 300),
    alternates: { canonical: `/games/${game.slug}` },
    openGraph: openGraph({
      title: `${game.name} — boutique Dev AppStore`,
      description: description.slice(0, 300),
      url: `/games/${game.slug}`,
      ...(image ? { images: [{ url: image }] } : {}),
    }),
    twitter: { card: image ? 'summary_large_image' : 'summary', title: game.name, description: description.slice(0, 200) },
  };
}

export default async function GamePage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const game = await loadGame(slug);
  if (!game) notFound();
  const { items, storeDescription, screenshots, ...rest } = game;
  // ?item= (lien partagé) ou ?buy= (retour de /games/[slug]/link) : rouvre le détail de l'article.
  const initial = initialStoreItem(sp);
  // Seules les URL de notre stockage ou de la bibliothèque /art sont affichées (CHK-UPL-07).
  const shots = screenshots.flatMap((u) => {
    const safe = safeImageUrl(u);
    return safe ? [safe] : [];
  });
  const about = storeDescription.trim() || game.description;

  return (
    <div className="mx-auto max-w-6xl py-0 sm:px-6 sm:py-6">
      <GameStore game={rest} items={items} initialItemId={initial.itemId} initialBuy={initial.buy} />
      {shots.length > 0 && (
        <section className="mx-4 mt-6 rounded-[var(--radius)] bg-surface p-5 sm:mx-0" aria-labelledby="screenshots-title">
          <h2 id="screenshots-title" className="mb-3 font-bold">
            Captures d’écran
          </h2>
          <ScreenshotGallery urls={shots} gameName={game.name} />
        </section>
      )}
      {about && (
        <section className="mx-4 mt-6 rounded-[var(--radius)] bg-surface p-5 sm:mx-0" aria-labelledby="about-title">
          <h2 id="about-title" className="font-bold">
            À propos de {game.name}
          </h2>
          <ReadMore text={about} />
          <p className="mt-3 text-sm text-ink-2">
            Catégorie : {game.category}
            {game.publisherName ? ` · Éditeur : ${game.publisherName}` : ''}
          </p>
        </section>
      )}
      <GameReviews gameId={game.id} slug={game.slug} gameName={game.name} />
      <p className="mx-4 mt-4 mb-6 text-right text-xs sm:mx-0">
        <Link href={`/games/${encodeURIComponent(game.slug)}/report`} className="text-ink-2 underline-offset-2 hover:text-ink hover:underline">
          Signaler ce contenu
        </Link>
      </p>
    </div>
  );
}
