/*
 * Configuration sensible de l'authentification (tâche « auth », revue de sécurité CHK-CFG-02 / T-AUTH-02).
 * Module sans dépendance (ni base, ni Next.js, ni process.env) : les règles du secret de session sont appliquées
 * au démarrage par src/env.ts (validateEnv, appelé par src/instrumentation.ts) et par ./auth.ts, qui lui passe `env`.
 */

/** Variables utiles à l'authentification (`env` de src/env.ts, ou un objet de test). */
export interface AuthEnv {
  readonly NODE_ENV?: string;
  readonly NEXT_PHASE?: string;
  readonly AUTH_SECRET?: string;
  readonly BETTER_AUTH_SECRET?: string;
}

type Env = AuthEnv;

/** Secret de développement : uniquement hors production, jamais si un secret est défini. */
export const DEV_AUTH_SECRET = 'devappstore-dev-secret-ne-pas-utiliser-en-production-0123456789';

export const AUTH_SECRET_MIN_LENGTH = 32;

const PLACEHOLDERS = new Set(['change-me', 'changeme', 'secret', 'dev-secret', 'your-secret', 'better-auth-secret', DEV_AUTH_SECRET]);

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(`[auth] ${message} — Dev AppStore refuse de démarrer. Générez un secret : openssl rand -hex 32`);
    this.name = 'AuthConfigError';
  }
}

/** Production réelle (pas la compilation `next build`, où les secrets d'exécution peuvent manquer). */
export function isProductionRuntime(env: Env): boolean {
  return env.NODE_ENV === 'production' && env.NEXT_PHASE !== 'phase-production-build';
}

/**
 * Problème du secret de session en production réelle (message sans la valeur du secret), ou null s'il est utilisable.
 * Hors production (et pendant `next build`), toujours null : le secret de développement est utilisé.
 */
export function authSecretProblem(env: Env): string | null {
  if (!isProductionRuntime(env)) return null;
  const secret = (env.BETTER_AUTH_SECRET || env.AUTH_SECRET || '').trim();
  if (!secret) return 'AUTH_SECRET (ou BETTER_AUTH_SECRET) est obligatoire en production';
  if (PLACEHOLDERS.has(secret.toLowerCase())) return 'AUTH_SECRET contient une valeur d’exemple, interdite en production';
  if (secret.length < AUTH_SECRET_MIN_LENGTH) {
    return `AUTH_SECRET trop court (${secret.length} caractères, minimum ${AUTH_SECRET_MIN_LENGTH} en production)`;
  }
  return null;
}

/**
 * Secret de signature des sessions Better Auth (`BETTER_AUTH_SECRET`, sinon `AUTH_SECRET`).
 * En production : obligatoire, ≥ 32 caractères, pas une valeur d'exemple — sinon AuthConfigError.
 * Ne renvoie jamais le secret dans un message d'erreur.
 */
export function resolveAuthSecret(env: Env): string {
  const problem = authSecretProblem(env);
  if (problem) throw new AuthConfigError(problem);
  const secret = (env.BETTER_AUTH_SECRET || env.AUTH_SECRET || '').trim();
  return secret || DEV_AUTH_SECRET;
}

/** Cookies de session : HttpOnly, SameSite=Lax, Path=/ ; Secure (+ préfixe __Secure-) en production. */
export function sessionCookieOptions(env: Env) {
  const secure = isProductionRuntime(env);
  return {
    useSecureCookies: secure,
    defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' as const, path: '/', secure },
  };
}

/** Lève AuthConfigError si le secret de session est inutilisable (la vérification au démarrage passe par src/env.ts). */
export function assertAuthConfig(env: Env): void {
  resolveAuthSecret(env);
}

/* ------------------------------------------------------------------------------------------------
 * Revue de sécurité 2026-11 (A-06, A-07, A-13)
 * ---------------------------------------------------------------------------------------------- */

/** A-07 : réponse unique d'une inscription refusée (formulaire et /api/auth/sign-up/email). */
export const SIGN_UP_FAILED_CODE = 'SIGN_UP_FAILED';
export const SIGN_UP_FAILED_MESSAGE =
  'Impossible de créer un compte avec ces informations. Si vous avez déjà un compte, connectez-vous ; sinon, utilisez une autre adresse.';

/** A-06 : comptes du seed (`@devappstore.test`, mot de passe public) — aucune session en production. */
export function isDemoAccountEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && /@devappstore\.test$/i.test(email.trim());
}

/** Même limite que le formulaire d'inscription (auth-flows.ts). */
export const USER_NAME_MAX_LENGTH = 80;
const IMAGE_URL_MAX_LENGTH = 2048;

/**
 * A-13 : profil normalisé pour toute écriture Better Auth (inscription HTTP, connexion sociale, /update-user), qui
 * contourne les schémas zod des formulaires : `name` coupé à 80 caractères, `image` limitée aux URL https.
 * Lève une erreur (message français) si `name` est fourni mais vide.
 */
export function sanitizeUserProfile<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = { ...data };
  if ('name' in data && data.name !== undefined) {
    const name = typeof data.name === 'string' ? data.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, USER_NAME_MAX_LENGTH).trim() : '';
    if (!name) throw new Error('Saisissez votre nom.');
    out.name = name;
  }
  if ('image' in data && data.image != null) {
    const img = data.image;
    out.image = typeof img === 'string' && img.length <= IMAGE_URL_MAX_LENGTH && /^https:\/\/[^\s]+$/i.test(img) ? img : null;
  }
  return out as T;
}
