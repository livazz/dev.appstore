import { db, eq, games } from '@devappstore/db';
import { requireGameAccess } from '@/server/session';
import { SALES_ROLES, getTransactions, localDay, transactionsToCsv } from '@/server/analytics';
import { parseSalesPeriod } from '@/lib/analytics-format';

export const dynamic = 'force-dynamic';

/** GET /studio/games/[id]/sales/export?days=7|30|90 → CSV des transactions de la période (owner, admin, finance). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // Ventes : owner, admin, finance (matrice des rôles, CHK-MT-06). Redirige vers /login si non connecté.
    await requireGameAccess(id, [...SALES_ROLES]);
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') return new Response('Accès refusé', { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
    throw e;
  }
  const [game] = await db.select({ slug: games.slug }).from(games).where(eq(games.id, id));
  if (!game) return new Response('Jeu introuvable', { status: 404 });

  const days = parseSalesPeriod(new URL(req.url).searchParams.get('days'));
  const rows = await getTransactions(id, { days });
  const filename = `devappstore-ventes-${game.slug}-${days}j-${localDay(new Date())}.csv`;
  return new Response(transactionsToCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
