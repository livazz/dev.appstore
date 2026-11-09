import 'server-only';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { newId } from '@wolleen/core';
import { account, db, session, user, verification, type DB } from '@wolleen/db';

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

function authSecret() {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
    console.error('[auth] BETTER_AUTH_SECRET manquant : définissez-le en production.');
  }
  // Secret de développement uniquement (jamais utilisé si BETTER_AUTH_SECRET est défini).
  return 'wolleen-dev-secret-ne-pas-utiliser-en-production-0123456789';
}

/** Construit une instance Better Auth sur une base donnée (la base partagée en prod, une base en mémoire en test). */
export function createAuth(database: DB) {
  const socialProviders = socialProvidersFromEnv();
  return betterAuth({
    appName: 'Wolleen',
    logger: { disabled: process.env.VITEST === 'true' },
    secret: authSecret(),
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
    advanced: {
      cookiePrefix: 'wolleen',
      database: { generateId: ({ model }) => newId(ID_PREFIX[model] ?? model.slice(0, 3)) },
    },
    // Doit rester le dernier plugin : recopie les cookies Better Auth dans les Server Actions Next.js.
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Instance de l'application (base partagée `db`). */
export const auth: Auth = createAuth(db);
