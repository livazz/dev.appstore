import Link from 'next/link';
import { getMyReview, getRatingBreakdown, listGameReviews } from '@/server/reviews';
import { RATINGS, formatAverage, formatReviewCount, sharePct } from '@/server/reviews-logic';
import { VERIFY_EMAIL_PATH } from '@/server/email-verification';
import { getCurrentUser } from '@/server/session';
import { ReviewForm } from './ReviewForm';
import { ReviewList } from './ReviewList';
import { Stars } from './Stars';

/**
 * Section « Avis » en bas de la page jeu : note moyenne, répartition 5 → 1, formulaire du joueur connecté
 * et liste des avis (plus récents d'abord, 10 par page).
 */
export async function GameReviews({ gameId, slug, gameName }: { gameId: string; slug: string; gameName: string }) {
  const user = await getCurrentUser();
  const [breakdown, first, mine] = await Promise.all([
    getRatingBreakdown(gameId),
    listGameReviews(gameId, 1, user?.id),
    user ? getMyReview(gameId, user.id) : Promise.resolve(null),
  ]);
  const path = `/games/${encodeURIComponent(slug)}`;
  const now = new Date().toISOString();

  return (
    <section id="avis" className="mx-4 mt-6 scroll-mt-20 rounded-[var(--radius)] bg-surface p-5 sm:mx-0" aria-labelledby="reviews-title">
      <h2 id="reviews-title" className="font-bold">
        Avis des joueurs
      </h2>

      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,15rem)_1fr]">
        <div>
          {breakdown.count ? (
            <>
              <p className="flex items-end gap-2">
                <span className="text-4xl font-black leading-none text-ink">{formatAverage(breakdown.average)}</span>
                <span className="pb-0.5 text-sm text-ink-2">sur 5</span>
              </p>
              <div className="mt-2">
                <Stars value={breakdown.average} size="lg" />
              </div>
              <p className="mt-1 text-sm text-ink-2" data-testid="reviews-count">
                {formatReviewCount(breakdown.count)}
              </p>
              <ul className="mt-4 flex flex-col gap-1.5" aria-label="Répartition des notes">
                {RATINGS.map((n) => {
                  const pct = sharePct(breakdown, n);
                  return (
                    <li key={n} className="flex items-center gap-2 text-xs text-ink-2">
                      <span className="w-14 shrink-0">
                        {n} étoile{n > 1 ? 's' : ''}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
                        <span className="block h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="w-9 shrink-0 text-right tabular-nums">
                        <span className="sr-only">{breakdown.distribution[n]} avis, </span>
                        {pct} %
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-sm text-ink-2">Aucun avis pour l’instant. Soyez le premier à donner le vôtre !</p>
          )}
        </div>

        <div className="min-w-0">
          <div className="rounded-xl bg-bg p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">{mine ? 'Votre avis' : 'Donner mon avis'}</h3>
            {!user ? (
              <p className="text-sm text-ink-2">
                <Link href={`/login?next=${encodeURIComponent(`${path}#avis`)}`} className="font-semibold text-primary hover:underline">
                  Connectez-vous pour donner votre avis
                </Link>
                .
              </p>
            ) : user.emailVerified === false ? (
              <p className="text-sm text-ink-2">
                Confirmez votre adresse e-mail pour publier un avis.{' '}
                <Link href={VERIFY_EMAIL_PATH} className="font-semibold text-primary hover:underline">
                  Recevoir le lien de confirmation
                </Link>
              </p>
            ) : (
              <ReviewForm slug={slug} gameName={gameName} existing={mine ? { rating: mine.rating, body: mine.body, hidden: mine.status === 'hidden' } : null} />
            )}
          </div>

          {first.total > 0 && (
            <div className="mt-2">
              <ReviewList key={`${first.total}:${first.reviews[0]?.id ?? ''}:${mine?.updatedAt.getTime() ?? 0}`} gameId={gameId} first={first} now={now} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
