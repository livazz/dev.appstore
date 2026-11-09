import { apiError } from '@/server/api-key';
import { cronGuard } from '@/server/delivery-http';
import { previousWeekStart, sendAllWeeklyReports } from '@/server/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/weekly-reports[?week=AAAA-MM-JJ] — rapport hebdomadaire de chaque studio (planifié le lundi 6 h UTC).
 * Par défaut : la dernière semaine complète (lundi → dimanche, UTC). Idempotent : un studio ne reçoit qu'un rapport par semaine.
 * Protégé par `Authorization: Bearer $CRON_SECRET` (cronGuard, comparaison à temps constant).
 */
export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;

  const week = new URL(req.url).searchParams.get('week');
  let weekStart = previousWeekStart();
  if (week) {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(week) ? new Date(`${week}T00:00:00Z`) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return apiError(400, 'invalid_week', 'Paramètre week attendu au format AAAA-MM-JJ.');
    weekStart = parsed;
  }
  const run = await sendAllWeeklyReports(weekStart);
  return Response.json({ ok: true, ...run }, { headers: { 'Cache-Control': 'no-store' } });
}
