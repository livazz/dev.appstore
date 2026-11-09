import { cronGuard } from '@/server/delivery-http';
import { expireStalePendingOrders } from '@/server/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/checkout/expire — passe à `failed` les commandes `pending` de plus de 24 h (lot borné à 500).
 * Planifiée toutes les heures (vercel.json) avec `Authorization: Bearer $CRON_SECRET` (cronGuard, comparaison à
 * temps constant ; 503 si CRON_SECRET est vide hors développement). L'expiration est aussi faite pour l'utilisateur
 * courant à chaque nouvel achat.
 */
export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const expired = await expireStalePendingOrders({ limit: 500 });
  return Response.json({ ok: true, expired }, { headers: { 'Cache-Control': 'no-store' } });
}
