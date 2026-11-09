import { db, eq, games } from '@wolleen/db';
import { requireGameAccess } from '@/server/session';
import { getTransactions, localDay, transactionsToCsv } from '@/server/analytics';
import { parseSalesPeriod } from '@/lib/analytics-format';

export const dynamic = 'force-dynamic';

/** GET /studio/games/[id]/sales/export?days=7|30|90 → CSV des transactions de la période (membres du studio). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireGameAccess(id); // redirige vers /login si non connecté
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') return new Response('Accès refusé', { status: 403 });
    throw e;
  }
  const [game] = await db.select({ slug: games.slug }).from(games).where(eq(games.id, id));
  if (!game) return new Response('Jeu introuvable', { status: 404 });

  const days = parseSalesPeriod(new URL(req.url).searchParams.get('days'));
  const rows = await getTransactions(id, { days });
  const filename = `wolleen-ventes-${game.slug}-${days}j-${localDay(new Date())}.csv`;
  return new Response(transactionsToCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
