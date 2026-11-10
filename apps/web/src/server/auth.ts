import 'server-only';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { newId } from '@devappstore/core';
import { account, db, eq, session, user, verification, type DB } from '@devappstore/db';
import { env } from '@/env';
import {
  SIGN_UP_FAILED_CODE,
  SIGN_UP_FAILED_MESSAGE,
  isDemoAccountEmail,
  resolveAuthSecret,
  sanitizeUserProfile,
  sessionCookieOptions,
} from './auth-config';
import { authLimiter, clientIp, recordSignInFailure, signInRetryAfter, type SlidingWindowLimiter } from './auth-rate-limit';
import { isUserDisabled } from './user-suspension';

/*
 * Instance Better Auth (tâche « auth »).
 * - E-mail + mot de passe toujours actifs.
 * - Google / Apple activés seulement si leurs variables d'environnement existent.
 * - Tables existantes user / session / account / verification (packages/db/src/schema/auth.ts) via l'adaptateur Drizzle.
 *   Les noms de propriétés Drizzle (camelCase) correspondent aux champs Better Auth : aucun mappage de colonnes nécessaire.
 * - Identifiants préfixés comme le reste du domaine (usr_, ses_, acc_, ver_).
 * - Configuration (secret, URL publique, origines, fournisseurs) lue dans `env` (src/env.ts), validé au démarrage.
 */

const ID_PREFIX: Record<string, string> = { user: 'usr', session: 'ses', account: 'acc', verification: 'ver' };

export const PASSWORD_MIN_LENGTH = 8;

/** `env` (src/env.ts) ou tout objet de variables (tests). */
type SocialEnv = Readonly<Record<string, unknown>> &
  Partial<Record<'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET' | 'APPLE_CLIENT_ID' | 'APPLE_CLIENT_SECRET' | 'APPLE_APP_BUNDLE_IDENTIFIER', string>>;

/** Fournisseurs sociaux configurés par l'environnement (utilisé aussi par les pages pour afficher les boutons). */
export function socialProvidersFromEnv(source: SocialEnv = env): NonNullable<BetterAuthOptions['socialProviders']> {
  const providers: NonNullable<BetterAuthOptions['socialProviders']> = {};
  if (source.GOOGLE_CLIENT_ID && source.GOOGLE_CLIENT_SECRET) {
    providers.google = { clientId: source.GOOGLE_CLIENT_ID, clientSecret: source.GOOGLE_CLIENT_SECRET };
  }
  if (source.APPLE_CLIENT_ID && source.APPLE_CLIENT_SECRET) {
    providers.apple = {
      clientId: source.APPLE_CLIENT_ID,
      clientSecret: source.APPLE_CLIENT_SECRET,
      ...(source.APPLE_APP_BUNDLE_IDENTIFIER ? { appBundleIdentifier: source.APPLE_APP_BUNDLE_IDENTIFIER } : {}),
    };
  }
  return providers;
}

/** URL publique donnée à Better Auth : BETTER_AUTH_URL, sinon APP_URL (undefined → déduite de la requête, dev). */
export function authBaseUrl(): string | undefined {
  return env.BETTER_AUTH_URL ?? env.APP_URL ?? undefined;
}

/** Origines de confiance (CSRF Better Auth) : localhost en dev, BETTER_AUTH_TRUSTED_ORIGINS, Apple si activé. */
export function authTrustedOrigins(socialProviders = socialProvidersFromEnv()): string[] {
  return [
    ...(!env.isProduction ? ['http://localhost:3000', 'http://localhost:3001'] : []),
    ...(env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
    ...(socialProviders.apple ? ['https://appleid.apple.com'] : []),
  ];
}

export type SocialProviderId = 'google' | 'apple';

export function enabledSocialProviders(): SocialProviderId[] {
  return Object.keys(socialProvidersFromEnv()) as SocialProviderId[];
}

/** Profil normalisé (A-13) ; un nom vide devient une erreur 400 Better Auth. */
function sanitizedOrBadRequest<T extends Record<string, unknown>>(data: T): T {
  try {
    return sanitizeUserProfile(data);
  } catch (e) {
    throw new APIError('BAD_REQUEST', { message: e instanceof Error ? e.message : 'Profil invalide.' });
  }
}

export interface CreateAuthOptions {
  /** Limiteur des échecs de connexion de la route HTTP (instance partagée par défaut ; injectable en test). */
  limiter?: SlidingWindowLimiter;
}

/** Construit une instance Better Auth sur une base donnée (la base partagée en prod, une base en mémoire en test). */
export function createAuth(database: DB, opts: CreateAuthOptions = {}) {
  const socialProviders = socialProvidersFromEnv();
  const limiter = opts.limiter ?? authLimiter;
  return betterAuth({
    appName: 'Dev AppStore',
    logger: { disabled: process.env.VITEST === 'true' },
    // Obligatoire et robuste en production (lève AuthConfigError sinon) — validé aussi au démarrage (env.ts).
    secret: resolveAuthSecret(env),
    baseURL: authBaseUrl(),
    trustedOrigins: authTrustedOrigins(socialProviders),
    database: drizzleAdapter(database, { provider: 'pg', schema: { user, session, account, verification } }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    socialProviders,
    account: { accountLinking: { enabled: true, trustedProviders: ['google', 'apple'] } },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 jours
      updateAge: 60 * 60 * 24, // rafraîchie au plus une fois par jour
    },
    // Compte désactivé depuis le back-office : aucune nouvelle session (connexion e-mail ou sociale).
    databaseHooks: {
      session: {
        create: {
          before: async (s) => {
            if (await isUserDisabled(s.userId, database)) {
              throw new APIError('FORBIDDEN', { message: 'Ce compte a été désactivé. Contactez le support Dev AppStore.' });
            }
            // A-06 : les comptes du seed (mot de passe public, superadmin) n'ouvrent jamais de session en production.
            if (env.isProduction) {
              const [u] = await database.select({ email: user.email }).from(user).where(eq(user.id, s.userId)).limit(1);
              if (isDemoAccountEmail(u?.email)) throw new APIError('FORBIDDEN', { message: 'Compte de démonstration : connexion impossible en production.' });
            }
          },
        },
      },
      // A-13 : nom et image bornés quelle que soit l'entrée (formulaire, route HTTP, fournisseur social, /update-user).
      user: {
        create: { before: async (u) => ({ data: sanitizedOrBadRequest(u) }) },
        update: { before: async (u) => ({ data: sanitizedOrBadRequest(u) }) },
      },
    },
    /*
     * Route HTTP /api/auth/* (ctx.request défini ; les Server Actions appellent auth.api sans requête et ont leur
     * propre limitation dans auth-flows.ts) :
     * - A-05 : mêmes plafonds d'échecs que le formulaire (e-mail + IP, e-mail, IP) sur /sign-in/email ;
     * - A-07 : l'inscription refusée ne renvoie plus le code USER_ALREADY_EXISTS.
     */
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/email' || !ctx.request) return;
        const email = typeof ctx.body?.email === 'string' ? ctx.body.email : '';
        if (email && signInRetryAfter(limiter, email, clientIp(ctx.headers))) {
          throw new APIError('TOO_MANY_REQUESTS', { message: 'Trop de tentatives. Réessayez dans quelques minutes.' });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (!ctx.request) return;
        const returned = ctx.context.returned;
        if (!isAPIError(returned)) return;
        if (ctx.path === '/sign-in/email' && returned.statusCode !== 429) {
          const email = typeof ctx.body?.email === 'string' ? ctx.body.email : '';
          if (email) recordSignInFailure(limiter, email, clientIp(ctx.headers));
        }
        if (ctx.path === '/sign-up/email' && String(returned.body?.code ?? '').startsWith('USER_ALREADY_EXISTS')) {
          throw new APIError('BAD_REQUEST', { code: SIGN_UP_FAILED_CODE, message: SIGN_UP_FAILED_MESSAGE });
        }
      }),
    },
    // Limitation intégrée de Better Auth pour les routes HTTP /api/auth/* (les Server Actions ont la leur :
    // auth-rate-limit.ts). Désactivée sous vitest pour ne pas perturber les tests d'intégration.
    rateLimit: {
      enabled: process.env.VITEST !== 'true',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 3600, max: 10 },
        '/request-password-reset': { window: 3600, max: 5 },
        '/forget-password': { window: 3600, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: 'devappstore',
      // Cookies HttpOnly + SameSite=Lax + Path=/ ; Secure en production (CHK-AUTH-03).
      ...sessionCookieOptions(env),
      database: { generateId: ({ model }) => newId(ID_PREFIX[model] ?? model.slice(0, 3)) },
    },
    // Doit rester le dernier plugin : recopie les cookies Better Auth dans les Server Actions Next.js.
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Instance de l'application (base partagée `db`). */
export const auth: Auth = createAuth(db);
