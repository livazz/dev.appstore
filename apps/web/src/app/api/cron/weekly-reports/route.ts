import { apiError } from '@/server/api-key';
import { isCronAuthorized } from '@/server/delivery-http';
import { previousWeekStart, sendAllWeeklyReports } from '@/server/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/weekly-reports[?week=AAAA-MM-JJ] — rapport hebdomadaire de chaque studio (à planifier le lundi matin).
 * Par défaut : la dernière semaine complète (lundi → dimanche, UTC). Idempotent : un studio ne reçoit qu'un rapport par semaine.
 * Protégé par `Authorization: Bearer $CRON_SECRET` ; en production, CRON_SECRET est obligatoire.
 */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
    return apiError(503, 'cron_secret_missing', 'CRON_SECRET doit être défini en production.');
  }
  if (!isCronAuthorized(req)) return apiError(401, 'unauthorized', 'CRON_SECRET invalide.');

  const week = new URL(req.url).searchParams.get('week');
  let weekStart = previousWeekStart();
  if (week) {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(week) ? new Date(`${week}T00:00:00Z`) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return apiError(400, 'invalid_week', 'Paramètre week attendu au format AAAA-MM-JJ.');
    weekStart = parsed;
  }
  const run = await sendAllWeeklyReports(weekStart);
  return Response.json({ ok: true, ...run });
}
