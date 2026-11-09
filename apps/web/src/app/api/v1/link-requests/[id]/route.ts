import { authenticateApi } from '@/server/api-key';
import { corsError, corsPreflight, unauthorized, withCors } from '@/server/delivery-http';
import { getLinkRequest } from '@/server/player-tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/link-requests/{link_request_id} — état d'une demande de liaison (interrogée toutes les 2-5 s par le SDK).
 * → { status: 'pending', player_id, expires_at } | { status: 'expired' } | { status: 'linked', player_id, player_token? }
 *   | { status: 'claimed', player_id }
 * Clé publique : au premier appel après la saisie du code, `player_token` (`wk_pt_…`) est délivré UNE seule fois ;
 * à conserver par le jeu (stockage local) et à envoyer dans `Wolleen-Player-Token`. Clé secrète : statut seulement.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req);
  if (!auth) return unauthorized();
  const { id } = await params;
  const r = await getLinkRequest(auth, id);
  if (!r) return corsError(404, 'link_request_not_found', 'Demande de liaison introuvable pour ce jeu.');
  return withCors(Response.json(r, { headers: { 'cache-control': 'no-store' } }));
}

export function OPTIONS() {
  return corsPreflight();
}
