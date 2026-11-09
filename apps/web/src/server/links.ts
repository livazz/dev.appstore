import 'server-only';
import { and, db, eq, gameLinks } from '@devappstore/db';

/** CONTRAT PARTAGÉ — compte de jeu lié par l'utilisateur pour un jeu (ou null). Propriétaire : tâche « linking ». */
export async function getGameLink(userId: string, gameId: string) {
  const [row] = await db.select().from(gameLinks).where(and(eq(gameLinks.userId, userId), eq(gameLinks.gameId, gameId)));
  return row ?? null;
}
