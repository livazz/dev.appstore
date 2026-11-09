import Link from 'next/link';
import { db } from '@wolleen/db';
import { formatMoney } from '@wolleen/core';
import { getUserStudios, requireUser } from '@/server/session';
import { listStudioGames } from '@/server/studio-logic';
import { GAME_STATUS_LABELS } from '@/lib/studio-types';
import { IconPlus } from '@/components/studio/icons';

export const dynamic = 'force-dynamic';

/** « Mes jeux » — tuiles style App Store Connect. */
export default async function StudioHome() {
  const user = await requireUser('/studio');
  const [studios, list] = await Promise.all([getUserStudios(user.id), listStudioGames(db, user.id)]);

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold sm:text-3xl">
        <Link href="/studio" className="text-ink-2 hover:text-ink">Accueil</Link>
        <span className="text-ink-3"> / </span>
        <span>Mes jeux</span>
      </h1>

      {!studios.length ? (
        <section className="max-w-xl rounded-2xl bg-surface p-8 shadow-sm">
          <h2 className="text-lg font-semibold">Vous n&apos;avez pas encore de studio</h2>
          <p className="mt-2 text-sm text-ink-2">
            Créez votre compte studio pour publier la boutique de votre jeu et garder jusqu&apos;à 95 % de chaque vente.
          </p>
          <Link href="/studio/signup" className="mt-5 inline-block rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:opacity-90">
            Créer mon studio
          </Link>
        </section>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5">
          {list.map((g) => (
            <Link
              key={g.id}
              href={`/studio/games/${g.id}`}
              className="group flex flex-col items-center gap-1 rounded-2xl bg-surface p-5 text-center shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-2 flex size-24 items-center justify-center overflow-hidden rounded-[22px] bg-bg shadow-sm ring-1 ring-black/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {g.iconUrl ? <img src={g.iconUrl} alt="" className="size-full object-cover" /> : <span className="text-3xl font-bold text-ink-3">{g.name[0]}</span>}
              </div>
              <strong className="line-clamp-1 text-base">{g.name}</strong>
              <span className="line-clamp-1 text-sm text-ink-2">{g.publisherName || g.category}</span>
              <span
                className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${g.status === 'live' ? 'bg-ok/15 text-ok' : 'bg-bg text-ink-2'}`}
              >
                <i className={`size-1.5 rounded-full ${g.status === 'live' ? 'bg-ok' : 'bg-ink-3'}`} />
                {GAME_STATUS_LABELS[g.status]}
              </span>
              <span className="mt-3 flex w-full justify-between border-t border-line pt-3 text-xs text-ink-2">
                <span>
                  {g.itemCount} article{g.itemCount > 1 ? 's' : ''}
                </span>
                <span>{formatMoney(g.revenue30dCents, g.currency)} · 30 j</span>
              </span>
            </Link>
          ))}
          <Link
            href="/studio/games/new"
            className="flex min-h-56 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line p-5 text-center text-ink-2 transition hover:border-primary hover:text-primary"
          >
            <span className="mb-2 flex size-14 items-center justify-center rounded-full bg-surface shadow-sm">
              <IconPlus size={26} />
            </span>
            <strong className="text-base text-ink">Nouveau jeu</strong>
            <span className="text-sm">Créer une boutique</span>
          </Link>
        </div>
      )}
    </>
  );
}
