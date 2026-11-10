'use client';

import { useActionState, useEffect, useState } from 'react';
import { RATING_LABELS, REVIEW_BODY_MAX, REVIEW_BODY_MIN, type Rating } from '@/server/reviews-logic';
import { deleteReviewAction, saveReviewAction, type ReviewFormState } from './actions';

const initial: ReviewFormState = {};

const input =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

/** Formulaire « Donner mon avis » / « Modifier mon avis » (compte connecté, e-mail vérifié). */
export function ReviewForm({
  slug,
  gameName,
  existing,
}: {
  slug: string;
  gameName: string;
  existing: { rating: Rating; body: string; hidden: boolean } | null;
}) {
  const [state, save, saving] = useActionState(saveReviewAction, initial);
  const [delState, remove, deleting] = useActionState(deleteReviewAction, initial);
  const [editing, setEditing] = useState(!existing);
  const [rating, setRating] = useState<number>(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState(existing?.body ?? '');

  // Après un enregistrement réussi, revenir à l'affichage (la page est revalidée avec le nouvel avis).
  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);
  useEffect(() => {
    if (delState.ok) {
      setEditing(true);
      setRating(0);
      setBody('');
    }
  }, [delState]);

  const status = (s: ReviewFormState) =>
    s.message ? (
      <p role={s.ok ? 'status' : 'alert'} className={`rounded-lg p-2.5 text-sm ${s.ok ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'}`}>
        {s.message}
      </p>
    ) : null;
  const latest = (delState.at ?? 0) > (state.at ?? 0) ? delState : state;

  if (existing && !editing) {
    return (
      <div className="flex flex-col gap-3">
        {status(latest)}
        {existing.hidden && (
          <p className="rounded-lg bg-warn/10 p-2.5 text-sm text-ink">Votre avis a été masqué par la modération : il n’est plus visible des autres joueurs.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} className="rounded-[var(--radius)] bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            Modifier mon avis
          </button>
          <form
            action={remove}
            onSubmit={(e) => {
              if (!window.confirm('Supprimer définitivement votre avis ?')) e.preventDefault();
            }}
          >
            <input type="hidden" name="slug" value={slug} />
            <button
              type="submit"
              disabled={deleting}
              className="rounded-[var(--radius)] px-4 py-2 text-sm font-semibold text-danger ring-1 ring-danger/40 hover:bg-danger/5 disabled:opacity-60"
            >
              {deleting ? 'Suppression…' : 'Supprimer mon avis'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const shown = hover || rating;
  const len = [...body.trim()].length;
  return (
    <form action={save} className="flex flex-col gap-4" aria-label={`Votre avis sur ${gameName}`}>
      <input type="hidden" name="slug" value={slug} />
      {status(latest)}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">
          Votre note <span className="text-danger">*</span>
        </legend>
        <div className="flex items-center gap-3">
          <div className="flex" onMouseLeave={() => setHover(0)}>
            {([1, 2, 3, 4, 5] as Rating[]).map((n) => (
              <label key={n} className="cursor-pointer p-0.5" onMouseEnter={() => setHover(n)}>
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  required
                  checked={rating === n}
                  onChange={() => setRating(n)}
                  className="peer sr-only"
                />
                <span className="sr-only">
                  {n} étoile{n > 1 ? 's' : ''} — {RATING_LABELS[n]}
                </span>
                <svg viewBox="0 0 20 20" className="size-8 rounded peer-focus-visible:outline-2 peer-focus-visible:outline-primary" aria-hidden>
                  <path
                    d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.8l-5.2 2.8 1-5.8L1.5 7.7l5.9-.9z"
                    className={n <= shown ? 'text-amber-400' : 'text-ink-3'}
                    fill={n <= shown ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
              </label>
            ))}
          </div>
          <span className="text-sm text-ink-2" aria-hidden>
            {shown ? RATING_LABELS[shown as Rating] : 'Choisissez une note'}
          </span>
        </div>
      </fieldset>
      <div>
        <label htmlFor="review-body" className="mb-1.5 block text-sm font-medium text-ink">
          Votre avis <span className="text-danger">*</span>
        </label>
        <textarea
          id="review-body"
          name="body"
          required
          minLength={REVIEW_BODY_MIN}
          maxLength={REVIEW_BODY_MAX}
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Ce que vous aimez, ce qui pourrait être amélioré, les achats in-app…"
          aria-describedby="review-body-hint"
          className={input}
        />
        <p id="review-body-hint" className={`mt-1 text-xs ${len > REVIEW_BODY_MAX ? 'text-danger' : 'text-ink-2'}`}>
          {len}/{REVIEW_BODY_MAX} caractères (au moins {REVIEW_BODY_MIN}). Texte simple, publié avec votre prénom et l’initiale de votre nom.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} aria-busy={saving} className="rounded-[var(--radius)] bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
          {saving ? 'Publication…' : existing ? 'Enregistrer les modifications' : 'Publier mon avis'}
        </button>
        {existing && (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setRating(existing.rating);
              setBody(existing.body);
            }}
            className="rounded-[var(--radius)] px-4 py-2 text-sm font-semibold text-ink-2 ring-1 ring-line hover:bg-bg"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
