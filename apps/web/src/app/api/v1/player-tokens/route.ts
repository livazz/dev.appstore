import { authenticateApi } from '@/server/api-key';
import { corsPreflight, missingPlayerId, playerTokenRequired, readPlayerId, unauthorized, withCors } from '@/server/delivery-http';
import { revokePlayerToken, revokePlayerTokens } from '@/server/player-tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/v1/player-tokens — révocation des jetons joueur.
 * - Clé publique + `Wolleen-Player-Token` : révoque ce jeton (le joueur délie cet appareil) → { ok: true, revoked: 1 }.
 * - Clé secrète + `?player_id=` : révoque tous les jetons de ce joueur (serveur du studio) → { ok: true, revoked: n }.
 */
export async function DELETE(req: Request) {
  const auth = await authenticateApi(req);
  if (!auth) return unauthorized();
  if (auth.kind === 'publishable') {
    if (!auth.player) return playerTokenRequired();
    const revoked = (await revokePlayerToken(auth.player.tokenId)) ? 1 : 0;
    return withCors(Response.json({ ok: true, revoked }));
  }
  const playerId = readPlayerId(req);
  if (!playerId) return missingPlayerId();
  const revoked = await revokePlayerTokens(auth.game.id, playerId);
  return withCors(Response.json({ ok: true, revoked }));
}

export function OPTIONS() {
  return corsPreflight();
}
