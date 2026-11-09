import { guardApi } from '@/server/api-rate-limit';
import { acknowledgeDelivery } from '@/server/delivery';
import { corsError, corsPreflight, resolvePlayerScope, withCors } from '@/server/delivery-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notFound = () => corsError(404, 'delivery_not_found', 'Livraison introuvable pour ce jeu.');

/**
 * POST /api/v1/deliveries/{id}/ack → { ok: true } — idempotent ; 404 si la livraison n'appartient pas au jeu
 * (ni, avec la clé publique, au joueur du jeton et à son compte Wolleen).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(req, 'ack');
  if (!guard.ok) return guard.res;
  const auth = guard.auth;
  const target = resolvePlayerScope(auth, req, { requirePlayerId: false });
  if (!target.ok) return target.res;
  const { id } = await params;
  if (!id || id.length > 64) return notFound();
  const result = await acknowledgeDelivery(auth.game.id, id, target.scope);
  if (result === 'not_found') return notFound();
  return withCors(Response.json({ ok: true }));
}

export function OPTIONS() {
  return corsPreflight();
}
