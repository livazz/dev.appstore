import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { apiError } from './api-key';

/**
 * Aides HTTP de l'API publique des livraisons (propriétaire : tâche « delivery »).
 * CORS ouvert : le SDK peut tourner dans un navigateur (WebGL) et s'authentifie par `Authorization: Bearer`,
 * jamais par cookie — `Access-Control-Allow-Origin: *` est donc sans risque CSRF.
 */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Last-Event-ID',
  'Access-Control-Max-Age': '86400',
};

export function withCors<T extends Response>(res: T): T {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** `player_id` obligatoire (1 à 200 caractères). */
export function readPlayerId(req: Request): string | null {
  const v = new URL(req.url).searchParams.get('player_id')?.trim() ?? '';
  return v && v.length <= 200 ? v : null;
}

export const unauthorized = () => withCors(apiError(401, 'unauthorized', 'Clé API manquante ou invalide (Authorization: Bearer wk_…).'));
export const missingPlayerId = () => withCors(apiError(400, 'invalid_player_id', 'Paramètre player_id obligatoire (200 caractères max).'));

/** Protège le cron : si CRON_SECRET est défini, exige `Authorization: Bearer <CRON_SECRET>`. */
export function isCronAuthorized(req: Request, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return true;
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
