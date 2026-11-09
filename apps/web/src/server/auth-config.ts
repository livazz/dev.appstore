/*
 * Configuration sensible de l'authentification (tâche « auth », revue de sécurité CHK-CFG-02 / T-AUTH-02).
 * Module sans dépendance (ni base, ni Next.js) : importé par ./auth.ts ET par src/instrumentation.ts, pour que le
 * serveur refuse de démarrer en production sans secret de session solide (échec au boot, pas à la 1re requête).
 */

type Env = Record<string, string | undefined>;

/** Secret de développement : uniquement hors production, jamais si un secret est défini. */
export const DEV_AUTH_SECRET = 'wolleen-dev-secret-ne-pas-utiliser-en-production-0123456789';

export const AUTH_SECRET_MIN_LENGTH = 32;

const PLACEHOLDERS = new Set(['change-me', 'changeme', 'secret', 'dev-secret', 'your-secret', 'better-auth-secret', DEV_AUTH_SECRET]);

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(`[auth] ${message} — Wolleen refuse de démarrer. Générez un secret : openssl rand -hex 32`);
    this.name = 'AuthConfigError';
  }
}

/** Production réelle (pas la compilation `next build`, où les secrets d'exécution peuvent manquer). */
export function isProductionRuntime(env: Env = process.env): boolean {
  return env.NODE_ENV === 'production' && env.NEXT_PHASE !== 'phase-production-build';
}

/**
 * Secret de signature des sessions Better Auth (`BETTER_AUTH_SECRET`, sinon `AUTH_SECRET`).
 * En production : obligatoire, ≥ 32 caractères, pas une valeur d'exemple — sinon AuthConfigError.
 * Ne renvoie jamais le secret dans un message d'erreur.
 */
export function resolveAuthSecret(env: Env = process.env): string {
  const secret = (env.BETTER_AUTH_SECRET || env.AUTH_SECRET || '').trim();
  if (!isProductionRuntime(env)) return secret || DEV_AUTH_SECRET;
  if (!secret) throw new AuthConfigError('AUTH_SECRET (ou BETTER_AUTH_SECRET) est obligatoire en production');
  if (PLACEHOLDERS.has(secret.toLowerCase())) throw new AuthConfigError('AUTH_SECRET contient une valeur d’exemple, interdite en production');
  if (secret.length < AUTH_SECRET_MIN_LENGTH) {
    throw new AuthConfigError(`AUTH_SECRET trop court (${secret.length} caractères, minimum ${AUTH_SECRET_MIN_LENGTH} en production)`);
  }
  return secret;
}

/** Cookies de session : HttpOnly, SameSite=Lax, Path=/ ; Secure (+ préfixe __Secure-) en production. */
export function sessionCookieOptions(env: Env = process.env) {
  const secure = isProductionRuntime(env);
  return {
    useSecureCookies: secure,
    defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' as const, path: '/', secure },
  };
}

/** Vérification au démarrage (instrumentation.ts) : lève AuthConfigError si la configuration est invalide. */
export function assertAuthConfig(env: Env = process.env): void {
  resolveAuthSecret(env);
}
