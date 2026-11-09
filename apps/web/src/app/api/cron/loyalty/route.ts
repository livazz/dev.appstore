import { cronGuard } from '@/server/delivery-http';
import { ensureBonusDeliveries, expirePoints } from '@/server/loyalty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/loyalty — tâche quotidienne des Points Wolleen : inscrit les expirations de points (et des bons non
 * utilisés) dans le registre, puis rattrape la livraison des objets bonus dont l'envoi a échoué juste après le rachat.
 * Idempotente. Protégée par `Authorization: Bearer $CRON_SECRET` (cronGuard, comparaison à temps constant).
 */
export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const expired = await expirePoints();
  const bonusDeliveries = await ensureBonusDeliveries();
  return Response.json({ ok: true, expired, bonusDeliveries }, { headers: { 'Cache-Control': 'no-store' } });
}
