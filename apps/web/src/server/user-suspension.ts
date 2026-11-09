import 'server-only';
import { db, eq, userSuspensions, type DB } from '@devappstore/db';

/*
 * Comptes désactivés par l'équipe Dev AppStore (back-office /admin/users).
 * Module sans dépendance vers session.ts / auth.ts, pour pouvoir être appelé depuis les deux sans cycle
 * (branchements décrits dans le rapport de la tâche « admin »).
 */

export async function isUserDisabled(userId: string, database: DB = db): Promise<boolean> {
  const [row] = await database.select({ userId: userSuspensions.userId }).from(userSuspensions).where(eq(userSuspensions.userId, userId)).limit(1);
  return !!row;
}
