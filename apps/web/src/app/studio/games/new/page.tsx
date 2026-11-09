import Link from 'next/link';
import { db } from '@wolleen/db';
import { requireUser } from '@/server/session';
import { findCreatorStudio } from '@/server/studio-logic';
import { NewGameForm } from '@/components/studio/NewGameForm';

export const dynamic = 'force-dynamic';

export default async function NewGamePage() {
  const user = await requireUser('/studio/games/new');
  const studio = await findCreatorStudio(db, user.id);

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold sm:text-3xl">
        <Link href="/studio" className="text-ink-2 hover:text-ink">Accueil</Link>
        <span className="text-ink-3"> / </span>
        <Link href="/studio" className="text-ink-2 hover:text-ink">Mes jeux</Link>
        <span className="text-ink-3"> / </span>
        <span>Nouveau jeu</span>
      </h1>
      <section className="max-w-xl rounded-2xl bg-surface p-6 shadow-sm sm:p-8">
        {studio ? (
          <NewGameForm studioName={studio.name} />
        ) : (
          <>
            <h2 className="text-lg font-semibold">Aucun studio</h2>
            <p className="mt-2 text-sm text-ink-2">Vous devez être propriétaire, admin ou développeur d&apos;un studio pour créer un jeu.</p>
            <Link href="/studio/signup" className="mt-5 inline-block rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white">
              Créer mon studio
            </Link>
          </>
        )}
      </section>
    </>
  );
}
