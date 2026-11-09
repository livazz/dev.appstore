import { authenticateGame } from '@/server/api-key';
import { ensureDevRetryLoop, takeOpenDeliveries } from '@/server/delivery';
import { corsPreflight, missingPlayerId, readPlayerId, unauthorized, withCors } from '@/server/delivery-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/deliveries?player_id=… → { data: PurchaseEvent[] } (pending + delivered non acquittées). */
export async function GET(req: Request) {
  ensureDevRetryLoop();
  const game = await authenticateGame(req);
  if (!game) return unauthorized();
  const playerId = readPlayerId(req);
  if (!playerId) return missingPlayerId();
  const data = await takeOpenDeliveries(game, playerId);
  return withCors(Response.json({ data }, { headers: { 'cache-control': 'no-store' } }));
}

export function OPTIONS() {
  return corsPreflight();
}
