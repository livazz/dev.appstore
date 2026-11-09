import 'server-only';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { newId } from '@wolleen/core';
import { account, db, session, user, verification, type DB } from '@wolleen/db';
import { resolveAuthSecret, sessionCookieOptions } from './auth-config';

/*
 * Instance Better Auth (tâche « auth »).
 * - E-mail + mot de passe toujours actifs.
 * - Google / Apple activés seulement si leurs variables d'environnement existent.
 * - Tables existantes user / session / account / verification (packages/db/src/schema/auth.ts) via l'adaptateur Drizzle.
 *   Les noms de propriétés Drizzle (camelCase) correspondent aux champs Better Auth : aucun mappage de colonnes nécessaire.
 * - Identifiants préfixés comme le reste du domaine (usr_, ses_, acc_, ver_).
 */

const ID_PREFIX: Record<string, string> = { user: 'usr', session: 'ses', account: 'acc', verification: 'ver' };

export const PASSWORD_MIN_LENGTH = 8;

/** Fournisseurs sociaux configurés par l'environnement (utilisé aussi par les pages pour afficher les boutons). */
export function socialProvidersFromEnv(env: NodeJS.ProcessEnv = process.env): NonNullable<BetterAuthOptions['socialProviders']> {
  const providers: NonNullable<BetterAuthOptions['socialProviders']> = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) {
    providers.apple = {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: env.APPLE_CLIENT_SECRET,
      ...(env.APPLE_APP_BUNDLE_IDENTIFIER ? { appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER } : {}),
    };
  }
  return providers;
}

export type SocialProviderId = 'google' | 'apple';

export function enabledSocialProviders(): SocialProviderId[] {
  return Object.keys(socialProvidersFromEnv()) as SocialProviderId[];
}

/** Construit une instance Better Auth sur une base donnée (la base partagée en prod, une base en mémoire en test). */
export function createAuth(database: DB) {
  const socialProviders = socialProvidersFromEnv();
  return betterAuth({
    appName: 'Wolleen',
    logger: { disabled: process.env.VITEST === 'true' },
    // Obligatoire et robuste en production (lève AuthConfigError sinon) — cf. auth-config.ts / instrumentation.ts.
    secret: resolveAuthSecret(),
    baseURL: process.env.BETTER_AUTH_URL || process.env.APP_URL || undefined,
    trustedOrigins: [
      ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://localhost:3001'] : []),
      ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
      ...(socialProviders.apple ? ['https://appleid.apple.com'] : []),
    ],
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
      cookiePrefix: 'wolleen',
      // Cookies HttpOnly + SameSite=Lax + Path=/ ; Secure en production (CHK-AUTH-03).
      ...sessionCookieOptions(),
      database: { generateId: ({ model }) => newId(ID_PREFIX[model] ?? model.slice(0, 3)) },
    },
    // Doit rester le dernier plugin : recopie les cookies Better Auth dans les Server Actions Next.js.
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Instance de l'application (base partagée `db`). */
export const auth: Auth = createAuth(db);
