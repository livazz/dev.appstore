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
  // Revue de sécurité A-06 : depuis un poste de dev (NODE_ENV vide), une DATABASE_URL distante désigne peut-être la
  // production — le seed y créerait un superadmin au mot de passe public. Seules les bases locales sont acceptées,
  // sauf DEVAPPSTORE_ALLOW_SEED=1 explicite (base de démo distante assumée).
  if (env.DATABASE_URL && !isLocalDatabaseUrl(env.DATABASE_URL) && env.DEVAPPSTORE_ALLOW_SEED !== '1') {
    throw new Error(
      `Seed refusé : ${describeTarget(env)} n'est pas une base locale. Le seed crée un superadmin au mot de passe public ; ` +
        'pour une base de démo distante, relancez avec DEVAPPSTORE_ALLOW_SEED=1.',
    );
  }
}

/**
 * Base « locale » : localhost, 127.0.0.0/8, ::1, *.localhost, ou nom d'hôte sans point (service Docker Compose comme
 * `db`). Toute URL illisible est considérée comme distante.
 */
export function isLocalDatabaseUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127(\.\d{1,3}){3}$/.test(host)) return true;
  return !host.includes('.') && !host.includes(':');
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
