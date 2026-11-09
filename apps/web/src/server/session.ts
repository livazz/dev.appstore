import 'server-only';
import { redirect } from 'next/navigation';
import { and, db, eq, games, studioMembers, type DB } from '@wolleen/db';
import type { StudioRole } from '@wolleen/core';

/*
 * CONTRAT PARTAGÉ — signatures stables, utilisées par toutes les tâches.
 * Propriétaire de l'implémentation : tâche « auth » (Better Auth).
 * Implémentation provisoire (vague 0) : utilisateur de démo fixé par le cookie `wolleen_demo_user`
 * (valeurs : usr_demo_player | usr_demo_dev), défaut usr_demo_player.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const { cookies } = await import('next/headers');
  const id = (await cookies()).get('wolleen_demo_user')?.value ?? 'usr_demo_player';
  const u = await db.query.user.findFirst({ where: (t, { eq }) => eq(t.id, id) });
  return u ? { id: u.id, email: u.email, name: u.name } : null;
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
