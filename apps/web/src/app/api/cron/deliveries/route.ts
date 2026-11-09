import { apiError } from '@/server/api-key';
import { retryDueDeliveries } from '@/server/delivery';
import { isCronAuthorized } from '@/server/delivery-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET /api/cron/deliveries — relance les webhooks dus. Protégé par `Authorization: Bearer $CRON_SECRET` si défini. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return apiError(401, 'unauthorized', 'CRON_SECRET invalide.');
  const stats = await retryDueDeliveries();
  return Response.json({ ok: true, ...stats });
}
