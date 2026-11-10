'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { clientIp } from '@/server/client-ip';
import { deleteMyReview, listGameReviews, submitReview, type ReviewsPage } from '@/server/reviews';
import { parseReviewPage } from '@/server/reviews-logic';
import { getCurrentUser } from '@/server/session';
import { db, eq, and, games } from '@devappstore/db';

/*
 * Server Actions des avis (page jeu). Tout est revérifié côté serveur par server/reviews.ts : session, e-mail vérifié,
 * jeu en ligne, validation zod, limitation de débit.
 */

export interface ReviewFormState {
  ok?: boolean;
  message?: string;
  /** Saisie conservée après une erreur. */
  values?: { rating: string; body: string };
  at?: number;
}

const field = (fd: FormData, name: string, max: number) => {
  const v = fd.get(name);
  return typeof v === 'string' ? v.slice(0, max) : '';
};

const gamePath = (slug: string) => `/games/${encodeURIComponent(slug)}`;

export async function saveReviewAction(_prev: ReviewFormState, fd: FormData): Promise<ReviewFormState> {
  const slug = field(fd, 'slug', 200);
  const values = { rating: field(fd, 'rating', 2), body: field(fd, 'body', 4000) };
  const user = await getCurrentUser();
  const r = await submitReview(slug, { rating: values.rating, body: values.body }, { user, ip: clientIp(await headers()) });
  if (!r.ok) return { ok: false, message: r.message, values, at: Date.now() };
  revalidatePath(gamePath(slug));
  return {
    ok: true,
    message: r.hidden
      ? 'Avis modifié. Il reste masqué par la modération.'
      : r.created
        ? 'Merci ! Votre avis est publié.'
        : 'Votre avis a été modifié.',
    at: Date.now(),
  };
}

export async function deleteReviewAction(_prev: ReviewFormState, fd: FormData): Promise<ReviewFormState> {
  const slug = field(fd, 'slug', 200);
  const user = await getCurrentUser();
  const r = await deleteMyReview(slug, { user, ip: clientIp(await headers()) });
  if (!r.ok) return { ok: false, message: r.message, at: Date.now() };
  revalidatePath(gamePath(slug));
  return { ok: true, message: r.deleted ? 'Votre avis a été supprimé.' : 'Aucun avis à supprimer.', at: Date.now() };
}

/** Page suivante de la liste (bouton « Afficher plus d’avis »). Lecture publique, jeux en ligne seulement. */
export async function loadReviewsPageAction(gameId: string, page: number): Promise<ReviewsPage | null> {
  if (typeof gameId !== 'string' || gameId.length > 100) return null;
  const [g] = await db.select({ id: games.id }).from(games).where(and(eq(games.id, gameId), eq(games.status, 'live'))).limit(1);
  if (!g) return null;
  const user = await getCurrentUser();
  return listGameReviews(g.id, parseReviewPage(page), user?.id);
}
