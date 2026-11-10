/*
 * Bascule rapide entre les comptes de démo (menu « Rôle » flottant). Outil de DÉVELOPPEMENT uniquement :
 * jamais actif en production (et les comptes @devappstore.test y sont de toute façon refusés à la connexion).
 */

export type DemoRole = 'player' | 'studio' | 'admin';

export const DEMO_ROLES: { role: DemoRole; label: string; email: string; home: string; hint: string }[] = [
  { role: 'player', label: 'Joueur', email: 'joueur@devappstore.test', home: '/', hint: 'Achète, lie ses comptes de jeu' },
  { role: 'studio', label: 'Studio', email: 'dev@devappstore.test', home: '/studio', hint: 'Nova Games : boutique, ventes, intégration' },
  { role: 'admin', label: 'Admin', email: 'admin@devappstore.test', home: '/admin', hint: 'Back-office de la plateforme' },
];

/** Mot de passe des comptes de démo (packages/db/src/seed.ts, DEMO_PASSWORD) — public, comptes locaux uniquement. */
export const DEMO_ROLE_PASSWORD = 'demo1234';

/** Actif hors production, sauf `DEVAPPSTORE_ROLE_SWITCHER=0`. */
export function isRoleSwitcherEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== 'production' && env.DEVAPPSTORE_ROLE_SWITCHER !== '0';
}

export function demoRoleOf(email: string | null | undefined): DemoRole | null {
  if (!email) return null;
  return DEMO_ROLES.find((r) => r.email === email.toLowerCase())?.role ?? null;
}
