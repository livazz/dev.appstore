import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLiveGameBySlug } from '@/server/catalog';
import { CONTENT_POLICY_HREF } from '@/server/reports-logic';
import { getCurrentUser } from '@/server/session';
import { ReportForm } from './ReportForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Signaler un contenu', robots: { index: false } };

/**
 * Formulaire de signalement d'un contenu hors charte (DSA art. 16), ouvert aux visiteurs non connectés.
 * `?item=` : article visé, présélectionné (lien « Signaler cet article » du panneau d'article).
 */
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const game = await getLiveGameBySlug(slug);
  if (!game) notFound();
  const user = await getCurrentUser();
  const wanted = typeof sp.item === 'string' ? sp.item : undefined;
  const defaultItemId = wanted && game.items.some((i) => i.id === wanted) ? wanted : undefined;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <p className="text-sm text-ink-3">
        <Link href={`/games/${encodeURIComponent(game.slug)}`} className="hover:text-ink hover:underline">
          {game.name}
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Signaler ce contenu</h1>
      <p className="mt-3 text-sm text-ink-2">
        Un texte, un visuel, un article ou un prix de cette boutique vous paraît illicite, trompeur ou contraire à{' '}
        <Link href={CONTENT_POLICY_HREF} className="underline hover:text-ink">
          la charte des contenus
        </Link>{' '}
        ? Signalez-le : l’équipe Dev AppStore l’examine et vous informe de sa décision. Le studio n’a pas connaissance de votre identité.
      </p>
      <ReportForm
        slug={game.slug}
        gameName={game.name}
        items={game.items.map((i) => ({ id: i.id, title: i.title }))}
        defaultItemId={defaultItemId}
        accountEmail={user?.email}
      />
    </div>
  );
}
