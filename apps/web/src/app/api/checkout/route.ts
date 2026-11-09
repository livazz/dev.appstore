import { z } from 'zod';
import { getGameLink } from '@/server/links';
import {
  CheckoutError,
  clientIpFromHeaders,
  createCheckout,
  gameItemPath,
  getItemGameSlug,
  getPurchasableItemPrice,
  loginPath,
} from '@/server/payments';
import { getCurrentUser } from '@/server/session';
import { appOrigin, isProduction } from '@/server/stripe';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

function error(status: number, code: string, message: string, redirect?: string) {
  return Response.json({ error: { code, message }, ...(redirect ? { redirect } : {}) }, { status, headers: NO_STORE });
}

const Id = z.string().trim().min(1).max(128);

/**
 * GET /api/checkout?gameId=…[&itemId=…] — contexte d'achat pour le bouton :
 * `{ signedIn, link: { playerId, playerName } | null, item: { priceCents, currency, title } | null }`.
 * Le prix vient de la base (libellé « Payer X € ») ; il est relu côté serveur au moment du POST.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const gameId = Id.safeParse(url.searchParams.get('gameId'));
  if (!gameId.success) return error(400, 'invalid_request', 'Paramètre gameId manquant.');
  const itemIdRaw = url.searchParams.get('itemId');
  const itemId = itemIdRaw === null ? null : Id.safeParse(itemIdRaw);
  if (itemId && !itemId.success) return error(400, 'invalid_request', 'Paramètre itemId invalide.');
  const item = itemId?.success ? await getPurchasableItemPrice(itemId.data, gameId.data) : null;

  const user = await getCurrentUser();
  if (!user) return Response.json({ signedIn: false, link: null, item }, { headers: NO_STORE });
  const link = await getGameLink(user.id, gameId.data);
  return Response.json(
    { signedIn: true, link: link ? { playerId: link.playerId, playerName: link.playerName } : null, item },
    { headers: NO_STORE },
  );
}

/**
 * Corps accepté : uniquement `{ itemId, withdrawalWaiver }` (toute autre clé → 400 ; prix, devise, quantité,
 * jeu et joueur sont lus en base — CHK-PAY-01). `withdrawalWaiver` doit valoir `true` (case cochée).
 */
const Body = z.object({ itemId: Id, withdrawalWaiver: z.boolean().optional() }).strict();

/** Anti-CSRF (CHK-AUTH-07) : l'en-tête Origin, s'il est présent, doit être celui du site ; sinon Sec-Fetch-Site. */
function isSameOrigin(req: Request, origin: string): boolean {
  const got = req.headers.get('origin');
  if (got) return got === origin || (!isProduction() && got === new URL(req.url).origin);
  const site = req.headers.get('sec-fetch-site');
  return !site || site === 'same-origin' || site === 'none';
}

/**
 * POST /api/checkout `{ itemId, withdrawalWaiver: true }` → `{ url, orderId }`.
 * Erreurs : `{ error: { code, message }, redirect? }` — 400 (consent_required…), 401 (→ /login), 403 (origine),
 * 409 not_linked (→ liaison) / seller_not_ready, 404, 415, 422, 429 too_many_pending, 502, 503.
 */
export async function POST(req: Request) {
  let origin: string;
  try {
    origin = await appOrigin(req);
  } catch (e) {
    console.error('[checkout]', e instanceof Error ? e.message : e);
    return error(503, 'payments_unavailable', 'Le paiement est momentanément indisponible (configuration du serveur).');
  }
  if (!isSameOrigin(req, origin)) return error(403, 'forbidden_origin', 'Requête refusée.');
  if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return error(415, 'unsupported_media_type', 'Corps JSON attendu.');
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error(400, 'invalid_request', 'Requête invalide : seul itemId (et la case de livraison immédiate) est accepté.');
  const { itemId, withdrawalWaiver } = parsed.data;

  const user = await getCurrentUser();
  if (!user) {
    const slug = await getItemGameSlug(itemId);
    return error(401, 'unauthenticated', 'Connectez-vous pour acheter.', loginPath(slug ? gameItemPath(slug, itemId) : '/'));
  }

  try {
    const result = await createCheckout({
      user,
      itemId,
      origin,
      consent: { withdrawalWaiver: withdrawalWaiver === true, ip: clientIpFromHeaders(req.headers) },
    });
    return Response.json({ url: result.url, orderId: result.orderId }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof CheckoutError) return error(e.status, e.code, e.message, e.redirect);
    console.error('[checkout] Erreur inattendue', e instanceof Error ? e.message : 'erreur inconnue');
    return error(500, 'internal_error', 'Une erreur est survenue, réessayez.');
  }
}
