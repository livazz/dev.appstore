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
const readSession = cache(async (): Promise<SessionUser | null> => {
  const { headers } = await import('next/headers');
  const s = await auth.api.getSession({ headers: await headers() });
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
