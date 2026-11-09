import 'server-only';
import { hashApiKey } from '@wolleen/core';
import { db, eq, games } from '@wolleen/db';

/**
 * CONTRAT PARTAGÉ — authentifie un appel de l'API publique /api/v1 (serveur ou SDK du jeu).
 * En-tête : `Authorization: Bearer wk_…`. Renvoie le jeu, ou null (→ répondre 401).
 */
export async function authenticateGame(req: Request) {
  const h = req.headers.get('authorization') ?? '';
  const key = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!key) return null;
  const [game] = await db.select().from(games).where(eq(games.apiKeyHash, hashApiKey(key)));
  return game ?? null;
}

export function apiError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}
