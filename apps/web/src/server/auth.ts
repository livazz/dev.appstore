import 'server-only';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { newId } from '@wolleen/core';
import { account, db, session, user, verification, type DB } from '@wolleen/db';
import { env } from '@/env';
import { resolveAuthSecret, sessionCookieOptions } from './auth-config';

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

/** Construit une instance Better Auth sur une base donnée (la base partagée en prod, une base en mémoire en test). */
export function createAuth(database: DB) {
  const socialProviders = socialProvidersFromEnv();
  return betterAuth({
    appName: 'Wolleen',
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
