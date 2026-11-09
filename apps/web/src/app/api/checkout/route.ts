import { z } from 'zod';
import { getGameLink } from '@/server/links';
import { CheckoutError, createCheckout, gameItemPath, getItemGameSlug, loginPath } from '@/server/payments';
import { getCurrentUser } from '@/server/session';
import { appOrigin } from '@/server/stripe';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

function error(status: number, code: string, message: string, redirect?: string) {
  return Response.json({ error: { code, message }, ...(redirect ? { redirect } : {}) }, { status, headers: NO_STORE });
}

/**
 * GET /api/checkout?gameId=… — contexte d'achat pour le bouton Acheter :
 * `{ signedIn, link: { playerId, playerName } | null }`.
 */
export async function GET(req: Request) {
  const gameId = new URL(req.url).searchParams.get('gameId');
  if (!gameId) return error(400, 'invalid_request', 'Paramètre gameId manquant.');
  const user = await getCurrentUser();
  if (!user) return Response.json({ signedIn: false, link: null }, { headers: NO_STORE });
  const link = await getGameLink(user.id, gameId);
  return Response.json(
    { signedIn: true, link: link ? { playerId: link.playerId, playerName: link.playerName } : null },
    { headers: NO_STORE },
  );
}

const Body = z.object({ itemId: z.string().trim().min(1).max(128) });

/**
 * POST /api/checkout `{ itemId }` → `{ url, orderId }`.
 * Erreurs : `{ error: { code, message }, redirect? }` — 401 (→ /login), 409 not_linked (→ liaison), 404, 422, 502, 503.
 */
export async function POST(req: Request) {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return error(415, 'unsupported_media_type', 'Corps JSON attendu.');
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error(400, 'invalid_request', 'Paramètre itemId manquant ou invalide.');
  const { itemId } = parsed.data;

  const user = await getCurrentUser();
  if (!user) {
    const slug = await getItemGameSlug(itemId);
    return error(401, 'unauthenticated', 'Connectez-vous pour acheter.', loginPath(slug ? gameItemPath(slug, itemId) : '/'));
  }

  try {
    const result = await createCheckout({ user, itemId, origin: await appOrigin(req) });
    return Response.json({ url: result.url, orderId: result.orderId }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof CheckoutError) return error(e.status, e.code, e.message, e.redirect);
    console.error('[checkout] Erreur inattendue', e);
    return error(500, 'internal_error', 'Une erreur est survenue, réessayez.');
  }
}
