import { apiError, authenticateGame } from '@/server/api-key';
import { createLinkCode, linkCodeRequestSchema } from '@/server/linking';

/**
 * POST /api/v1/link-codes — appelé par le serveur ou le SDK du jeu (Authorization: Bearer <clé API>).
 * Corps : { player_id, player_name? } → 200 { code, expires_at }.
 * Le jeu affiche le code ; le joueur le saisit sur /games/[slug]/link (valable 10 min, usage unique).
 */
export async function POST(req: Request) {
  const game = await authenticateGame(req);
  if (!game) return apiError(401, 'unauthorized', 'Clé API manquante ou invalide.');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, 'invalid_json', 'Corps JSON invalide.');
  }
  const parsed = linkCodeRequestSchema.safeParse(body);
  if (!parsed.success) return apiError(400, 'invalid_request', 'player_id (1 à 128 caractères) est requis ; player_name : 64 caractères max.');

  const r = await createLinkCode(game, { playerId: parsed.data.player_id, playerName: parsed.data.player_name });
  if (!r.ok) {
    if (r.error === 'rate_limited') {
      const res = apiError(429, 'rate_limited', r.message);
      res.headers.set('Retry-After', String(r.retryAfterS ?? 60));
      return res;
    }
    return apiError(403, r.error, r.message);
  }
  return Response.json({ code: r.code, expires_at: r.expiresAt.toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
