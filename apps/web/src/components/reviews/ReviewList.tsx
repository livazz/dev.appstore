'use client';

import { useState, useTransition } from 'react';
import { relativeDate } from '@/server/reviews-logic';
import type { PublicReview, ReviewsPage } from '@/server/reviews';
import { loadReviewsPageAction } from './actions';
import { Stars } from './Stars';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });

function ReviewItem({ r, now }: { r: PublicReview; now: Date }) {
  const created = new Date(r.createdAt);
  return (
    <li className="border-t border-line py-4 first:border-t-0" data-testid="review">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars value={r.rating} size="sm" label={`${r.rating} sur 5`} />
        <span className="font-semibold text-ink">{r.authorName}</span>
        {r.mine && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Votre avis</span>}
        <time dateTime={created.toISOString()} title={dateFmt.format(created)} className="text-xs text-ink-2">
          {relativeDate(created, now)}
          {r.edited ? ' · modifié' : ''}
        </time>
      </div>
      {/* Texte brut : React échappe tout, aucun HTML n'est interprété. */}
      <p className="mt-1.5 whitespace-pre-line break-words text-sm text-ink">{r.body}</p>
    </li>
  );
}

/** Liste paginée (10 par page), complétée par « Afficher plus d’avis » sans recharger la page. */
export function ReviewList({ gameId, first, now }: { gameId: string; first: ReviewsPage; now: string }) {
  const [reviews, setReviews] = useState(first.reviews);
  const [page, setPage] = useState(first.page);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const ref = new Date(now);
  const more = page < first.totalPages;

  return (
    <>
      <ol aria-label="Avis des joueurs">
        {reviews.map((r) => (
          <ReviewItem key={r.id} r={r} now={ref} />
        ))}
      </ol>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      {more && (
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            disabled={pending}
            aria-busy={pending}
            onClick={() =>
              start(async () => {
                const next = await loadReviewsPageAction(gameId, page + 1).catch(() => null);
                if (!next) return setError('Impossible de charger la suite des avis. Réessayez.');
                setError('');
                const seen = new Set(reviews.map((r) => r.id));
                setReviews([...reviews, ...next.reviews.filter((r) => !seen.has(r.id))]);
                setPage(next.page);
              })
            }
            className="rounded-[var(--radius)] px-4 py-2 text-sm font-semibold text-primary ring-1 ring-line hover:bg-bg disabled:opacity-60"
          >
            {pending ? 'Chargement…' : 'Afficher plus d’avis'}
          </button>
          <span className="text-xs text-ink-2">
            {reviews.length} sur {first.total}
          </span>
        </div>
      )}
    </>
  );
}
