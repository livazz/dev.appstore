import { apiError, authenticateGame } from '@/server/api-key';
import { acknowledgeDelivery } from '@/server/delivery';
import { corsPreflight, unauthorized, withCors } from '@/server/delivery-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/deliveries/{id}/ack → { ok: true } — idempotent ; 404 si la livraison n'appartient pas au jeu. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const game = await authenticateGame(req);
  if (!game) return unauthorized();
  const { id } = await params;
  const result = await acknowledgeDelivery(game.id, id);
  if (result === 'not_found') return withCors(apiError(404, 'delivery_not_found', 'Livraison introuvable pour ce jeu.'));
  return withCors(Response.json({ ok: true }));
}

export function OPTIONS() {
  return corsPreflight();
}
