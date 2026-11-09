import { guardApi } from '@/server/api-rate-limit';
import { corsError, corsPreflight, withCors } from '@/server/delivery-http';
import { createLinkCode, linkCodeRequestSchema } from '@/server/linking';
import { recordLinkRequest } from '@/server/player-tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/link-codes — appelé par le serveur du studio (clé secrète) ou par le SDK client (clé publique).
 * Corps : { player_id, player_name? } → 200 { code, expires_at, link_request_id }.
 * Le jeu affiche le code ; le joueur le saisit sur /games/[slug]/link (valable 10 min, usage unique).
 * Avec la clé publique, le SDK interroge ensuite GET /api/v1/link-requests/{link_request_id} pour obtenir son jeton joueur.
 * Sécurité : avec la clé publique, n'importe quel client peut demander un code pour n'importe quel player_id ; le jeton
 * obtenu ne donne accès qu'aux achats du compte Wolleen qui a saisi le code (cf. server/player-tokens.ts).
 */
export async function POST(req: Request) {
  const guard = await guardApi(req, 'link-codes');
  if (!guard.ok) return guard.res;
  const auth = guard.auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return corsError(400, 'invalid_json', 'Corps JSON invalide.');
  }
  const parsed = linkCodeRequestSchema.safeParse(body);
  if (!parsed.success) return corsError(400, 'invalid_request', 'player_id (1 à 128 caractères) est requis ; player_name : 64 caractères max.');

  const r = await createLinkCode(auth.game, { playerId: parsed.data.player_id, playerName: parsed.data.player_name });
  if (!r.ok) {
    if (r.error === 'rate_limited') {
      const res = corsError(429, 'rate_limited', r.message);
      res.headers.set('Retry-After', String(r.retryAfterS ?? 60));
      return res;
    }
    return corsError(403, r.error, r.message);
  }
  const linkRequestId = await recordLinkRequest(auth.game.id, r.code, auth.kind);
  return withCors(
    Response.json(
      { code: r.code, expires_at: r.expiresAt.toISOString(), link_request_id: linkRequestId },
      { headers: { 'Cache-Control': 'no-store' } },
    ),
  );
}

export function OPTIONS() {
  return corsPreflight();
}
