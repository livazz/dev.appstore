import { timingSafeEqual } from 'node:crypto';
import { expireStalePendingOrders } from '@/server/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** `Authorization: Bearer <CRON_SECRET>` comparé à temps constant. */
function isAuthorized(req: Request, secret: string): boolean {
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * GET /api/checkout/expire — passe à `failed` les commandes `pending` de plus de 24 h (lot borné à 500).
 * À appeler par le planificateur (ex. toutes les heures) avec `Authorization: Bearer $CRON_SECRET` ;
 * refusé (503) si CRON_SECRET est vide. Route dédiée plutôt qu'un ajout à /api/cron/deliveries (périmètre de la
 * tâche « delivery ») ; l'expiration est aussi faite pour l'utilisateur courant à chaque nouvel achat.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return error(503, 'cron_not_configured', 'CRON_SECRET non défini.');
  if (!isAuthorized(req, secret)) return error(401, 'unauthorized', 'CRON_SECRET invalide.');
  const expired = await expireStalePendingOrders({ limit: 500 });
  return Response.json({ ok: true, expired }, { headers: { 'Cache-Control': 'no-store' } });
}
