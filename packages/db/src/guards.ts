/**
 * Garde-fous des scripts de base (seed, migrations). Fonctions pures : testées dans guards.test.ts.
 */

type Env = Record<string, string | undefined>;

/** Vrai si l'environnement désigne la production (Node ou Vercel). */
export function isProductionEnv(env: Env = process.env): boolean {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
}

/**
 * Le seed crée des comptes de démo au mot de passe connu et des clés API publiées dans le dépôt :
 * il est INTERDIT en production, sans échappatoire.
 */
export function assertSeedAllowed(env: Env = process.env): void {
  if (isProductionEnv(env)) {
    throw new Error(
      'Seed refusé : NODE_ENV/VERCEL_ENV = production. Le seed crée des comptes et des clés de démo publics ; ' +
        'il ne doit jamais tourner sur la base de production.',
    );
  }
}

/** Cible lisible d'une migration, sans jamais afficher d'identifiant ni de mot de passe. */
export function describeTarget(env: Env = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) return `PGlite (${env.DEVAPPSTORE_DATA_DIR ? `${env.DEVAPPSTORE_DATA_DIR}/pglite` : '.data/pglite'})`;
  try {
    const u = new URL(url);
    return `Postgres ${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
  } catch {
    return 'Postgres (DATABASE_URL illisible)';
  }
}
