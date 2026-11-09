import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { and, db, eq, games, studioMembers, type DB } from '@devappstore/db';
import type { StudioRole } from '@devappstore/core';
import { auth } from './auth';
import { isUserDisabled } from './user-suspension';

/*
 * CONTRAT PARTAGÉ — signatures stables, utilisées par toutes les tâches.
 * Implémentation : tâche « auth » (Better Auth, cf. ./auth.ts). La session est lue depuis le cookie
 * Better Auth de la requête en cours (Server Components, Server Actions, Route Handlers).
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Lecture de la session dédupliquée sur la durée d'un rendu serveur.
 * Un compte désactivé par le back-office (user-suspension.ts) n'a plus de session, même avec un cookie encore valide.
 */
const readRawSession = cache(async () => {
  const { headers } = await import('next/headers');
  return auth.api.getSession({ headers: await headers() });
});

const readSession = cache(async (): Promise<SessionUser | null> => {
  const s = await readRawSession();
  if (!s) return null;
  if (await isUserDisabled(s.user.id)) return null;
  return { id: s.user.id, email: s.user.email, name: s.user.name };
});

export async function getCurrentUser(): Promise<SessionUser | null> {
  return readSession();
}

/** Redirige vers /login?next=… si non connecté. */
export async function requireUser(next = '/'): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

/*
 * Revue de sécurité A-11 : connexion récente exigée pour les actions sensibles. L'âge est celui de la session
 * (`session.createdAt`, que le rafraîchissement quotidien ne modifie pas) : au-delà, l'utilisateur est renvoyé vers
 * /login?reauth=1, qui lui redemande son mot de passe même s'il est connecté, puis le ramène à `next`.
 */

/** Back-office /admin : une session de plus de 12 h doit être rouverte. */
export const ADMIN_RECENT_LOGIN_MS = 12 * 60 * 60_000;
/** Versements (onboarding et tableau de bord Stripe Connect) : connexion de moins de 30 min. */
export const PAYOUTS_RECENT_LOGIN_MS = 30 * 60_000;

/** Vrai si la session a été ouverte il y a moins de `maxAgeMs` (date absente ou invalide → faux). */
export function isRecentLogin(createdAt: Date | string | null | undefined, maxAgeMs: number, now = Date.now()): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) && t <= now + 60_000 && now - t <= maxAgeMs;
}

/** URL de ré-authentification pour revenir ensuite à `next`. */
export function reauthUrl(next: string): string {
  return `/login?reauth=1&next=${encodeURIComponent(next)}`;
}

/** Exige un utilisateur connecté dont la session a moins de `maxAgeMs` ; sinon redirige vers la ré-authentification. */
export async function requireRecentLogin(maxAgeMs: number, next: string): Promise<SessionUser> {
  const user = await requireUser(next);
  const s = await readRawSession();
  if (!isRecentLogin(s?.session.createdAt, maxAgeMs)) redirect(reauthUrl(next));
  return user;
}

/** Studios dont l'utilisateur est membre. */
export async function getUserStudios(userId: string, database: DB = db) {
  return database.query.studioMembers.findMany({ where: (t, { eq }) => eq(t.userId, userId) });
}

/** Vérifie que l'utilisateur courant est membre du studio propriétaire du jeu. Lance une erreur 403 sinon. */
export async function requireGameAccess(gameId: string, roles?: StudioRole[]) {
  const user = await requireUser('/studio');
  const [row] = await db
    .select({ studioId: games.studioId, role: studioMembers.role })
    .from(games)
    .innerJoin(studioMembers, and(eq(studioMembers.studioId, games.studioId), eq(studioMembers.userId, user.id)))
    .where(eq(games.id, gameId));
  if (!row || (roles && !roles.includes(row.role))) throw new Error('FORBIDDEN');
  return { user, studioId: row.studioId, role: row.role };
}
