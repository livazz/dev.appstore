import 'server-only';
import { db, desc, eq, gameModerationNotices, games, type DB } from '@wolleen/db';

/*
 * Lecture, côté espace studio, des décisions de modération de l'équipe Dev AppStore (exigence P2B : le motif d'une
 * suspension reste consultable par le studio, en plus de l'e-mail). L'appelant vérifie l'accès (requireGameAccess).
 */

export type ModerationNotice = typeof gameModerationNotices.$inferSelect;

/** Suspension en cours du jeu (dernière décision, si le jeu est toujours suspendu), sinon `null`. */
export async function getActiveSuspension(gameId: string, database: DB = db): Promise<ModerationNotice | null> {
  const [g] = await database.select({ status: games.status }).from(games).where(eq(games.id, gameId));
  if (g?.status !== 'suspended') return null;
  const [n] = await database
    .select()
    .from(gameModerationNotices)
    .where(eq(gameModerationNotices.gameId, gameId))
    .orderBy(desc(gameModerationNotices.createdAt))
    .limit(1);
  return n && n.action === 'suspend' ? n : null;
}

/** Historique des décisions (le plus récent d'abord). */
export async function listModerationNotices(gameId: string, database: DB = db): Promise<ModerationNotice[]> {
  return database.select().from(gameModerationNotices).where(eq(gameModerationNotices.gameId, gameId)).orderBy(desc(gameModerationNotices.createdAt)).limit(50);
}
