import { guardApi } from '@/server/api-rate-limit';
import { corsError, corsPreflight, withCors } from '@/server/delivery-http';
import { createLinkCode, linkCodeRequestSchema } from '@/server/linking';
import { siteUrl } from '@/lib/seo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/link-codes — appelé par le serveur du studio (clé secrète) ou par le SDK client (clé publique).
 * Corps : { player_id, player_name? } → 200 { code, expires_at, link_request_id, link_url, store_url }.
 * Le jeu affiche le code ; le joueur le saisit sur /games/[slug]/link (valable 10 min, usage unique).
 * Avec la clé publique, le SDK interroge ensuite GET /api/v1/link-requests/{link_request_id} pour obtenir son jeton joueur.
 * Sécurité : avec la clé publique, n'importe quel client peut demander un code pour n'importe quel player_id ; le jeton
 * obtenu ne donne accès qu'aux achats du compte Dev AppStore qui a saisi le code (cf. server/player-tokens.ts). Un code
 * public n'invalide aucun autre code et a son propre quota par jeu (revue 2026-11, F1) ; sa saisie demande une
 * confirmation explicite du joueur (F11).
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

  const r = await createLinkCode(auth.game, { playerId: parsed.data.player_id, playerName: parsed.data.player_name }, { source: auth.kind });
  if (!r.ok) {
    if (r.error === 'rate_limited') {
      const res = corsError(429, 'rate_limited', r.message);
      res.headers.set('Retry-After', String(r.retryAfterS ?? 60));
      return res;
    }
    return corsError(403, r.error, r.message);
  }
  const store = `${siteUrl()}/games/${encodeURIComponent(auth.game.slug)}`;
  return withCors(
    Response.json(
      {
        code: r.code,
        expires_at: r.expiresAt.toISOString(),
        link_request_id: r.linkRequestId,
        // Pages à ouvrir dans le navigateur du joueur depuis le jeu (bouton « Ouvrir la boutique » des SDK).
        link_url: `${store}/link`,
        store_url: store,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    ),
  );
}

export function OPTIONS() {
  return corsPreflight();
}
