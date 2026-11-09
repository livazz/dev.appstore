/*
 * Exécuté une fois au démarrage du serveur Next.js (dev et `next start`), avant toute requête.
 * Point de validation UNIQUE de la configuration (CHK-CFG-01, CHK-CFG-02, CHK-PAY-10, T-AUTH-02) : src/env.ts
 * (validateEnv) vérifie toutes les variables, dont le secret de session (règles de server/auth-config.ts).
 * Next.js se contente de journaliser une erreur levée ici et garde le processus en vie : on quitte explicitement
 * pour que l'orchestrateur (Docker, systemd…) voie l'échec. Pendant `next build`, la validation stricte est sautée.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { EnvValidationError, validateEnv } = await import('./env');
  try {
    validateEnv();
  } catch (e) {
    if (e instanceof EnvValidationError && process.env.VITEST !== 'true') {
      console.error(e.message);
      // Accès indirect : ce fichier est aussi analysé pour l'Edge Runtime, où process.exit n'existe pas.
      Reflect.get(process, 'exit').call(process, 1);
    }
    throw e;
  }
}
