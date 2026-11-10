import { signJwt } from '../jwt';
import { requestJson, type HttpOptions } from '../http';

export const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
export const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token';

/** Fichier JSON de clé d'un compte de service Google Cloud (champs utiles). */
export interface GoogleServiceAccountKey {
  type?: 'service_account' | string;
  client_email: string;
  private_key: string;
  private_key_id?: string;
  token_uri?: string;
  project_id?: string;
}

/** `token_uri` différent de l'URL officielle de Google (liste blanche stricte). */
export class InvalidTokenUriError extends Error {
  constructor() {
    super(`Clé de compte de service invalide : token_uri doit être ${GOOGLE_TOKEN_URI}.`);
    this.name = 'InvalidTokenUriError';
  }
}

export function parseServiceAccount(input: string | GoogleServiceAccountKey): GoogleServiceAccountKey {
  const sa = typeof input === 'string' ? (JSON.parse(input) as GoogleServiceAccountKey) : input;
  if (!sa || typeof sa !== 'object' || typeof sa.client_email !== 'string' || typeof sa.private_key !== 'string' || !sa.client_email || !sa.private_key) {
    throw new Error('Clé de compte de service invalide : client_email et private_key sont requis.');
  }
  // Anti-SSRF (revue 2026-11, C-01) : le jeton n'est demandé qu'au point de terminaison officiel de Google.
  if (sa.token_uri !== undefined && sa.token_uri !== GOOGLE_TOKEN_URI) {
    throw new InvalidTokenUriError();
  }
  return sa;
}

/**
 * Assertion JWT RS256 (RFC 7523) échangée contre un jeton d'accès OAuth 2.0.
 * Charge `{ iss: client_email, scope, aud: token_uri, iat, exp ≤ iat + 3600 }`.
 */
export function createServiceAccountAssertion(
  sa: GoogleServiceAccountKey,
  opts: { now?: number; scope?: string; ttlSeconds?: number } = {},
): string {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  const header: Record<string, unknown> = { typ: 'JWT' };
  if (sa.private_key_id) header.kid = sa.private_key_id;
  return signJwt(
    'RS256',
    header,
    {
      iss: sa.client_email,
      scope: opts.scope ?? ANDROID_PUBLISHER_SCOPE,
      aud: GOOGLE_TOKEN_URI,
      iat,
      exp: iat + Math.min(opts.ttlSeconds ?? 3600, 3600),
    },
    sa.private_key,
  );
}

export interface GoogleAccessToken {
  accessToken: string;
  /** Expiration (ms epoch). */
  expiresAt: number;
}

/** Échange l'assertion contre un jeton d'accès (`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`). */
export async function fetchGoogleAccessToken(
  sa: GoogleServiceAccountKey,
  opts: HttpOptions & { now?: number; scope?: string } = {},
): Promise<GoogleAccessToken> {
  const now = opts.now ?? Date.now();
  const assertion = createServiceAccountAssertion(sa, { now, scope: opts.scope });
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion });
  const res = await requestJson<{ access_token: string; expires_in?: number; token_type?: string }>(
    'google_oauth',
    GOOGLE_TOKEN_URI,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() },
    opts,
  );
  return { accessToken: res.access_token, expiresAt: now + (res.expires_in ?? 3600) * 1000 };
}
