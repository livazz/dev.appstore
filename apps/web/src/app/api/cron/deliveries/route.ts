import { retryDueDeliveries } from '@/server/delivery';
import { cronGuard } from '@/server/delivery-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/deliveries — relance les webhooks dus (achats et remboursements), par lots bornés (chaque minute).
 * Protégé par `Authorization: Bearer $CRON_SECRET` (cronGuard, comparaison à temps constant). Chaque livraison est
 * réservée atomiquement avant l'envoi : deux exécutions concurrentes n'envoient jamais la même livraison.
 */
export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const stats = await retryDueDeliveries();
  return Response.json({ ok: true, ...stats }, { headers: { 'Cache-Control': 'no-store' } });
}
