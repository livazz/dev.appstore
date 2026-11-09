import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, eq, games } from '@devappstore/db';
import { requireGameAccess } from '@/server/session';
import { GameActions, GameTabs } from '@/components/studio/GameNav';
import { SuspensionNotice } from '@/components/moderation/SuspensionNotice';

export const dynamic = 'force-dynamic';

/** Cadre commun des pages d'un jeu : fil d'Ariane, actions (+ / ⋯) et onglets. */
export default async function GameLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireGameAccess(id);
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') notFound();
    throw e;
  }
  const [game] = await db
    .select({ id: games.id, slug: games.slug, name: games.name, status: games.status })
    .from(games)
    .where(eq(games.id, id));
  if (!game) notFound();

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="min-w-0 text-2xl font-bold sm:text-3xl">
          <Link href="/studio" className="text-ink-2 hover:text-ink">Accueil</Link>
          <span className="text-ink-3"> / </span>
          <Link href="/studio" className="text-ink-2 hover:text-ink">Mes jeux</Link>
          <span className="text-ink-3"> / </span>
          <span>{game.name}</span>
        </h1>
        <GameActions gameId={game.id} slug={game.slug} name={game.name} status={game.status} />
      </div>
      <SuspensionNotice gameId={game.id} />
      <GameTabs gameId={game.id} />
      {children}
    </>
  );
}
