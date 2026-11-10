import 'server-only';
import { newId } from '@devappstore/core';
import { adminAuditLog, and, count, db, desc, eq, gameReviews, games, ilike, inArray, or, sql, type ReviewStatus } from '@devappstore/db';
import { AdminError, requireAdminPermission } from './admin';
import { escapeLike, firstIssue } from './admin-logic';
import { UNKNOWN_IP } from './client-ip';
import { emailNotVerifiedMessage, isEmailVerified } from './email-verification';
import { getRateLimitStore, type RateLimitStore } from './rate-limit';
import {
  EMPTY_SUMMARY,
  REVIEWS_PAGE_SIZE,
  REVIEW_LIMITS,
  breakdownFromCounts,
  publicAuthorName,
  reviewInputSchema,
  reviewModerationSchema,
  totalPages,
  type Rating,
  type RatingBreakdown,
  type RatingSummary,
  type ReviewInput,
} from './reviews-logic';

/*
 * Avis des joueurs (note 1 à 5 + commentaire) sous chaque jeu en ligne.
 *
 * - Lecture publique : seuls les avis `visible` des jeux `live` comptent (moyenne, répartition, liste).
 * - Écriture : compte connecté avec e-mail vérifié (relu en base), un avis par compte et par jeu (index unique
 *   `game_reviews_game_user_uq` : création ou modification par upsert), limitation de débit partagée
 *   (`rate_limit_counters` avec RATE_LIMIT_STORE=postgres). Un avis masqué par la modération le reste s'il est modifié.
 * - Modération : masquer / réafficher (permission `reports.moderate`), journalisé dans `admin_audit_log` dans la même
 *   transaction (cible : le jeu, l'avis dans les détails).
 */

export type { RatingSummary, RatingBreakdown } from './reviews-logic';

/**
 * Note moyenne et nombre d'avis visibles pour plusieurs jeux en une requête (classements, cartes du catalogue…).
 * Les jeux sans avis sont présents avec `{ average: 0, count: 0 }`.
 */
export async function getRatingsSummary(gameIds: readonly string[]): Promise<Map<string, RatingSummary>> {
  const ids = [...new Set(gameIds.filter((id) => typeof id === 'string' && id))];
  const out = new Map<string, RatingSummary>(ids.map((id) => [id, { ...EMPTY_SUMMARY }]));
  if (!ids.length) return out;
  const rows = await db
    .select({ gameId: gameReviews.gameId, n: count(), avg: sql<string | null>`avg(${gameReviews.rating})` })
    .from(gameReviews)
    .where(and(inArray(gameReviews.gameId, ids), eq(gameReviews.status, 'visible')))
    .groupBy(gameReviews.gameId);
  for (const r of rows) {
    const avg = Number(r.avg ?? 0);
    out.set(r.gameId, { average: Number.isFinite(avg) ? Math.round(avg * 10) / 10 : 0, count: Number(r.n) });
  }
  return out;
}

/** Note moyenne, nombre d'avis et répartition 5 → 1 d'un jeu (avis visibles). */
export async function getRatingBreakdown(gameId: string): Promise<RatingBreakdown> {
  const rows = await db
    .select({ rating: gameReviews.rating, n: count() })
    .from(gameReviews)
    .where(and(eq(gameReviews.gameId, gameId), eq(gameReviews.status, 'visible')))
    .groupBy(gameReviews.rating);
  return breakdownFromCounts(rows.map((r) => ({ rating: r.rating, count: Number(r.n) })));
}

export interface PublicReview {
  id: string;
  authorName: string;
  rating: Rating;
  body: string;
  createdAt: Date;
  /** Modifié après sa publication (plus d'une minute d'écart). */
  edited: boolean;
  /** Avis du joueur connecté. */
  mine: boolean;
}

export interface ReviewsPage {
  reviews: PublicReview[];
  page: number;
  totalPages: number;
  total: number;
}

const toPublic = (r: { id: string; authorName: string; rating: number; body: string; createdAt: Date; updatedAt: Date; userId: string | null }, viewerId?: string | null): PublicReview => ({
  id: r.id,
  authorName: r.authorName,
  rating: Math.min(5, Math.max(1, r.rating)) as Rating,
  body: r.body,
  createdAt: r.createdAt,
  edited: r.updatedAt.getTime() - r.createdAt.getTime() > 60_000,
  mine: !!viewerId && r.userId === viewerId,
});

/** Page d'avis visibles d'un jeu, les plus récents d'abord. */
export async function listGameReviews(gameId: string, page = 1, viewerId?: string | null): Promise<ReviewsPage> {
  const where = and(eq(gameReviews.gameId, gameId), eq(gameReviews.status, 'visible'));
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(gameReviews).where(where);
  const pages = totalPages(Number(n));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const rows = await db
    .select({
      id: gameReviews.id,
      authorName: gameReviews.authorName,
      rating: gameReviews.rating,
      body: gameReviews.body,
      createdAt: gameReviews.createdAt,
      updatedAt: gameReviews.updatedAt,
      userId: gameReviews.userId,
    })
    .from(gameReviews)
    .where(where)
    .orderBy(desc(gameReviews.createdAt), desc(gameReviews.id))
    .limit(REVIEWS_PAGE_SIZE)
    .offset((p - 1) * REVIEWS_PAGE_SIZE);
  return { reviews: rows.map((r) => toPublic(r, viewerId)), page: p, totalPages: pages, total: Number(n) };
}

export interface MyReview {
  id: string;
  rating: Rating;
  body: string;
  status: ReviewStatus;
  updatedAt: Date;
}

/** Avis du compte sur ce jeu (y compris masqué, pour le lui signaler), ou `null`. */
export async function getMyReview(gameId: string, userId: string): Promise<MyReview | null> {
  const [r] = await db
    .select({ id: gameReviews.id, rating: gameReviews.rating, body: gameReviews.body, status: gameReviews.status, updatedAt: gameReviews.updatedAt })
    .from(gameReviews)
    .where(and(eq(gameReviews.gameId, gameId), eq(gameReviews.userId, userId)))
    .limit(1);
  return r ? { ...r, rating: r.rating as Rating } : null;
}

/* ------------------------------------------------------------------------------------------------
 * Écriture (joueur)
 * ---------------------------------------------------------------------------------------------- */

export interface ReviewWriteContext {
  user: { id: string; name: string } | null;
  ip: string;
  now?: Date;
  store?: RateLimitStore;
}

export type ReviewWriteError = 'unauthenticated' | 'email_not_verified' | 'invalid' | 'not_found' | 'rate_limited';
export type SubmitReviewResult = { ok: true; reviewId: string; created: boolean; hidden: boolean } | { ok: false; error: ReviewWriteError; message: string };
export type DeleteReviewResult = { ok: true; deleted: boolean } | { ok: false; error: ReviewWriteError; message: string };

type Fail = { ok: false; error: ReviewWriteError; message: string };

async function liveGameId(gameSlug: string): Promise<string | null> {
  if (typeof gameSlug !== 'string' || !gameSlug || gameSlug.length > 200) return null;
  const [g] = await db.select({ id: games.id }).from(games).where(and(eq(games.slug, gameSlug), eq(games.status, 'live'))).limit(1);
  return g?.id ?? null;
}

async function checkWriter(ctx: ReviewWriteContext): Promise<Fail | null> {
  if (!ctx.user) return { ok: false, error: 'unauthenticated', message: 'Connectez-vous pour donner votre avis.' };
  if (!(await isEmailVerified(ctx.user.id))) return { ok: false, error: 'email_not_verified', message: emailNotVerifiedMessage('pour publier un avis') };
  return null;
}

async function checkRate(ctx: ReviewWriteContext & { user: { id: string } }): Promise<Fail | null> {
  const store = ctx.store ?? getRateLimitStore();
  const t = (ctx.now ?? new Date()).getTime();
  const checks = [
    [`review:user:${ctx.user.id}`, REVIEW_LIMITS.perUserBurst],
    [`review:user-day:${ctx.user.id}`, REVIEW_LIMITS.perUserDay],
    [`review:ip:${ctx.ip || UNKNOWN_IP}`, REVIEW_LIMITS.perIpHour],
  ] as const;
  for (const [key, rule] of checks) {
    const d = await store.hit(key, rule, t);
    if (!d.allowed) {
      return { ok: false, error: 'rate_limited', message: `Trop d’envois d’avis en peu de temps. Réessayez dans ${Math.max(1, Math.ceil(d.retryAfterS / 60))} min.` };
    }
  }
  return null;
}

/** Crée ou modifie l'avis du compte connecté sur un jeu en ligne. */
export async function submitReview(gameSlug: string, input: ReviewInput, ctx: ReviewWriteContext): Promise<SubmitReviewResult> {
  const denied = await checkWriter(ctx);
  if (denied) return denied;
  const user = ctx.user!;
  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid', message: firstIssue(parsed.error) };
  const gameId = await liveGameId(gameSlug);
  if (!gameId) return { ok: false, error: 'not_found', message: 'Ce jeu n’existe pas ou n’est plus en ligne.' };
  const limited = await checkRate({ ...ctx, user });
  if (limited) return limited;

  const now = ctx.now ?? new Date();
  const id = newId('rev');
  const [row] = await db
    .insert(gameReviews)
    .values({ id, gameId, userId: user.id, authorName: publicAuthorName(user.name), rating: parsed.data.rating, body: parsed.data.body, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [gameReviews.gameId, gameReviews.userId],
      set: { rating: parsed.data.rating, body: parsed.data.body, authorName: publicAuthorName(user.name), updatedAt: now },
    })
    .returning({ id: gameReviews.id, status: gameReviews.status });
  return { ok: true, reviewId: row!.id, created: row!.id === id, hidden: row!.status === 'hidden' };
}

/** Supprime l'avis du compte connecté sur ce jeu (sans effet s'il n'en a pas). */
export async function deleteMyReview(gameSlug: string, ctx: ReviewWriteContext): Promise<DeleteReviewResult> {
  if (!ctx.user) return { ok: false, error: 'unauthenticated', message: 'Connectez-vous pour gérer votre avis.' };
  const user = ctx.user;
  const [g] = await db.select({ id: games.id }).from(games).where(eq(games.slug, String(gameSlug).slice(0, 200))).limit(1);
  if (!g) return { ok: false, error: 'not_found', message: 'Ce jeu n’existe pas.' };
  const limited = await checkRate({ ...ctx, user });
  if (limited) return limited;
  const del = await db
    .delete(gameReviews)
    .where(and(eq(gameReviews.gameId, g.id), eq(gameReviews.userId, user.id)))
    .returning({ id: gameReviews.id });
  return { ok: true, deleted: del.length > 0 };
}

/* ------------------------------------------------------------------------------------------------
 * Modération (back-office)
 * ---------------------------------------------------------------------------------------------- */

export const ADMIN_REVIEWS_PAGE_SIZE = 50;

export interface AdminReviewRow {
  id: string;
  gameId: string;
  gameName: string;
  gameSlug: string;
  authorName: string;
  hasAccount: boolean;
  rating: number;
  body: string;
  status: ReviewStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Avis pour la modération, les plus récents d'abord (filtre par statut, recherche jeu / auteur / texte). */
export async function listReviewsForAdmin(filters: { status?: ReviewStatus | null; q?: string; page?: number }) {
  await requireAdminPermission('reports.moderate');
  const conds = [];
  if (filters.status) conds.push(eq(gameReviews.status, filters.status));
  const q = (filters.q ?? '').trim().slice(0, 100);
  if (q) {
    const like = `%${escapeLike(q)}%`;
    conds.push(or(ilike(games.name, like), ilike(gameReviews.authorName, like), ilike(gameReviews.body, like), eq(gameReviews.id, q)));
  }
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const rows = await db
    .select({
      id: gameReviews.id,
      gameId: games.id,
      gameName: games.name,
      gameSlug: games.slug,
      authorName: gameReviews.authorName,
      userId: gameReviews.userId,
      rating: gameReviews.rating,
      body: gameReviews.body,
      status: gameReviews.status,
      createdAt: gameReviews.createdAt,
      updatedAt: gameReviews.updatedAt,
    })
    .from(gameReviews)
    .innerJoin(games, eq(games.id, gameReviews.gameId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(gameReviews.createdAt), desc(gameReviews.id))
    .limit(ADMIN_REVIEWS_PAGE_SIZE + 1)
    .offset((page - 1) * ADMIN_REVIEWS_PAGE_SIZE);
  const [{ hidden } = { hidden: 0 }] = await db.select({ hidden: count() }).from(gameReviews).where(eq(gameReviews.status, 'hidden'));
  return {
    rows: rows.slice(0, ADMIN_REVIEWS_PAGE_SIZE).map(({ userId, ...r }): AdminReviewRow => ({ ...r, hasAccount: !!userId })),
    hasMore: rows.length > ADMIN_REVIEWS_PAGE_SIZE,
    page,
    hiddenTotal: Number(hidden),
  };
}

/** Masque ou réaffiche un avis ; journalisé dans `admin_audit_log` dans la même transaction. */
export async function setReviewStatus(reviewId: string, input: { status: unknown; reason?: unknown }): Promise<{ status: ReviewStatus; changed: boolean }> {
  const admin = await requireAdminPermission('reports.moderate');
  const parsed = reviewModerationSchema.safeParse({ status: input.status, reason: typeof input.reason === 'string' ? input.reason : undefined });
  if (!parsed.success) throw new AdminError(firstIssue(parsed.error));
  const { status, reason } = parsed.data;
  return db.transaction(async (tx) => {
    const [r] = await tx.select({ id: gameReviews.id, gameId: gameReviews.gameId, status: gameReviews.status, rating: gameReviews.rating }).from(gameReviews).where(eq(gameReviews.id, String(reviewId)));
    if (!r) throw new AdminError('Avis introuvable (supprimé par son auteur ?) : rechargez la page.');
    if (r.status === status) return { status, changed: false };
    // updatedAt inchangé : il indique une modification par l'auteur, pas par la modération.
    await tx.update(gameReviews).set({ status }).where(eq(gameReviews.id, r.id));
    await tx.insert(adminAuditLog).values({
      id: newId('aud'),
      adminId: admin.user.id,
      action: status === 'hidden' ? 'review.hide' : 'review.show',
      targetType: 'game',
      targetId: r.gameId,
      details: { reviewId: r.id, rating: r.rating, previousStatus: r.status, ...(reason ? { reason } : {}) },
    });
    return { status, changed: true };
  });
}
