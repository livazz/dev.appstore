import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/env';
import { PLAYER_TOKEN_HEADER, apiError, type ApiAuth } from './api-key';
import type { PlayerScope } from './delivery';

/**
 * Aides HTTP de l'API publique /api/v1 (propriétaire : tâche « delivery »).
 *
 * CORS ouvert à toutes les origines : le SDK peut tourner dans un navigateur (HTML5, WebGL) et s'authentifie par
 * en-têtes (`Authorization: Bearer`, `Wolleen-Player-Token`), JAMAIS par cookie. `Access-Control-Allow-Credentials`
 * n'est jamais envoyé et l'origine n'est jamais reflétée : un site tiers ne peut rien faire avec les cookies Wolleen.
 * Toutes les réponses des routes v1 (erreurs comprises) portent ces en-têtes, sinon le SDK ne peut pas lire l'erreur.
 */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': `Authorization, Content-Type, Last-Event-ID, ${PLAYER_TOKEN_HEADER}`,
  'Access-Control-Expose-Headers': 'Retry-After',
  'Access-Control-Max-Age': '86400',
};

export function withCors<T extends Response>(res: T): T {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Réponse d'erreur au format `apiError`, avec les en-têtes CORS. */
export const corsError = (status: number, code: string, message: string) => withCors(apiError(status, code, message));

/** `player_id` en paramètre (1 à 200 caractères), ou null. */
export function readPlayerId(req: Request): string | null {
  const v = new URL(req.url).searchParams.get('player_id')?.trim() ?? '';
  return v && v.length <= 200 ? v : null;
}

export const unauthorized = () => corsError(401, 'unauthorized', 'Clé API manquante ou invalide (Authorization: Bearer wk_…).');
export const missingPlayerId = () => corsError(400, 'invalid_player_id', 'Paramètre player_id obligatoire (200 caractères max).');
export const playerTokenRequired = () =>
  corsError(401, 'player_token_required', `Avec la clé publique, un jeton joueur valide est requis (${PLAYER_TOKEN_HEADER}). Liez le compte du joueur.`);

/**
 * Joueur visé par un appel deliveries / stream / ack.
 * - Clé secrète : `player_id` en paramètre (obligatoire pour la liste et le flux), aucune restriction d'acheteur.
 * - Clé publique : jeton joueur obligatoire ; le joueur est celui du jeton (un `player_id` différent → 403) et seuls
 *   les achats du compte Wolleen qui a lié l'appareil sont visibles.
 */
export function resolvePlayerScope(
  auth: ApiAuth,
  req: Request,
  opts: { requirePlayerId: boolean },
): { ok: true; playerId: string | null; scope: PlayerScope | undefined } | { ok: false; res: Response } {
  const requested = readPlayerId(req);
  if (auth.kind === 'secret') {
    if (!requested && opts.requirePlayerId) return { ok: false, res: missingPlayerId() };
    return { ok: true, playerId: requested, scope: undefined };
  }
  if (!auth.player) return { ok: false, res: playerTokenRequired() };
  if (requested && requested !== auth.player.playerId) {
    return { ok: false, res: corsError(403, 'player_mismatch', 'Ce jeton joueur ne donne accès qu’à son propre player_id.') };
  }
  return { ok: true, playerId: auth.player.playerId, scope: { playerId: auth.player.playerId, userId: auth.player.userId } };
}

/**
 * Protège les tâches planifiées : exige `Authorization: Bearer <CRON_SECRET>` (comparaison à temps constant).
 * Sans CRON_SECRET : accepté seulement en développement local (NODE_ENV=development), refusé partout ailleurs.
 */
export function isCronAuthorized(req: Request, secret: string | undefined = env.CRON_SECRET, nodeEnv: string = env.NODE_ENV): boolean {
  if (!secret) return nodeEnv === 'development';
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Garde commune des routes cron (`/api/cron/*`, `/api/checkout/expire`) : null si l'appel est autorisé, sinon la
 * réponse d'erreur — 503 `cron_not_configured` si CRON_SECRET manque (hors développement), 401 si le jeton est faux.
 * Vercel Cron envoie lui-même `Authorization: Bearer $CRON_SECRET`.
 */
export function cronGuard(req: Request, secret: string | undefined = env.CRON_SECRET, nodeEnv: string = env.NODE_ENV): Response | null {
  const noStore = { 'Cache-Control': 'no-store' };
  if (!secret && nodeEnv !== 'development') {
    return Response.json({ error: { code: 'cron_not_configured', message: 'CRON_SECRET non défini.' } }, { status: 503, headers: noStore });
  }
  if (!isCronAuthorized(req, secret, nodeEnv)) {
    return Response.json({ error: { code: 'unauthorized', message: 'CRON_SECRET manquant ou invalide.' } }, { status: 401, headers: noStore });
  }
  return null;
}
