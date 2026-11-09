/*
 * Exécuté une fois au démarrage du serveur Next.js (dev et `next start`), avant toute requête.
 * Revue de sécurité (CHK-CFG-02, T-AUTH-02) : en production, refuser de démarrer sans AUTH_SECRET solide.
 * La validation complète de l'environnement (src/env.ts, tâche ops) peut être ajoutée ici à la suite.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { assertAuthConfig } = await import('./server/auth-config');
  assertAuthConfig();
}
