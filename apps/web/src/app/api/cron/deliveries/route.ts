import { apiError } from '@/server/api-key';
import { retryDueDeliveries } from '@/server/delivery';
import { isCronAuthorized } from '@/server/delivery-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/deliveries — relance les webhooks dus (achats et remboursements), par lots bornés.
 * Protégé par `Authorization: Bearer $CRON_SECRET` (obligatoire en production). Chaque livraison est réservée
 * atomiquement avant l'envoi : deux exécutions concurrentes n'envoient jamais la même livraison.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return apiError(401, 'unauthorized', 'CRON_SECRET manquant ou invalide.');
  const stats = await retryDueDeliveries();
  return Response.json({ ok: true, ...stats });
}
