import { authenticateApi } from '@/server/api-key';
import { ensureDevRetryLoop, takeOpenDeliveries } from '@/server/delivery';
import { corsPreflight, resolvePlayerScope, unauthorized, withCors } from '@/server/delivery-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/deliveries → { data: PurchaseEvent[] } (pending + delivered non acquittées, achats et remboursements).
 * - Clé secrète : `?player_id=` obligatoire.
 * - Clé publique : en-tête `Wolleen-Player-Token` obligatoire ; renvoie seulement les achats du joueur du jeton.
 */
export async function GET(req: Request) {
  ensureDevRetryLoop();
  const auth = await authenticateApi(req);
  if (!auth) return unauthorized();
  const target = resolvePlayerScope(auth, req, { requirePlayerId: true });
  if (!target.ok) return target.res;
  const data = await takeOpenDeliveries(auth.game, target.playerId!, 100, { userId: target.scope?.userId });
  return withCors(Response.json({ data }, { headers: { 'cache-control': 'no-store' } }));
}

export function OPTIONS() {
  return corsPreflight();
}
