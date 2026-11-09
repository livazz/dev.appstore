/*
 * Données de démo (packages/db/src/seed.ts) vues par les tests.
 *
 * On n'importe PAS seed.ts : le module lance le seed à l'import (main() + process.exit). On relit donc le fichier
 * source pour en extraire les clés de démo — une clé renommée dans le seed est suivie automatiquement, et une
 * structure méconnaissable fait échouer clairement (cf. demo-data.test.ts).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from './env';

export const SEED_FILE = resolve(REPO_ROOT, 'packages/db/src/seed.ts');

export type DemoGameKey = 'crystal' | 'farm';

export interface DemoKey {
  apiKey: string;
  webhookSecret: string;
}

/** Extrait `DEMO_KEYS` du source du seed. */
export function parseDemoKeys(source: string): Record<DemoGameKey, DemoKey> {
  const block = /export\s+const\s+DEMO_KEYS\s*=\s*\{([\s\S]*?)\n\}/.exec(source)?.[1];
  if (!block) throw new Error('DEMO_KEYS introuvable dans packages/db/src/seed.ts');
  const read = (k: DemoGameKey): DemoKey => {
    const entry = new RegExp(`${k}\\s*:\\s*\\{([^}]*)\\}`).exec(block)?.[1] ?? '';
    const apiKey = /apiKey\s*:\s*['"]([^'"]+)['"]/.exec(entry)?.[1];
    const webhookSecret = /webhookSecret\s*:\s*['"]([^'"]+)['"]/.exec(entry)?.[1];
    if (!apiKey || !webhookSecret) throw new Error(`DEMO_KEYS.${k} illisible dans packages/db/src/seed.ts`);
    return { apiKey, webhookSecret };
  };
  return { crystal: read('crystal'), farm: read('farm') };
}

/** Mot de passe des comptes de démo : `DEMO_PASSWORD` du seed (tâche « auth »), sinon demo1234. */
export function parseDemoPassword(source: string): string {
  return /export\s+const\s+DEMO_PASSWORD\s*=\s*['"]([^'"]+)['"]/.exec(source)?.[1] ?? 'demo1234';
}

const seedSource = () => readFileSync(SEED_FILE, 'utf8');

let keysCache: Record<DemoGameKey, DemoKey> | undefined;
/** Clés de démo, lues une fois. */
export function demoKeys(): Record<DemoGameKey, DemoKey> {
  return (keysCache ??= parseDemoKeys(seedSource()));
}

export const DEMO_PASSWORD = parseDemoPassword(seedSource());

/** Comptes Dev AppStore de démo. */
export const COMPTES = {
  joueur: { email: 'joueur@devappstore.test', password: DEMO_PASSWORD, nom: 'Joueur Démo' },
  dev: { email: 'dev@devappstore.test', password: DEMO_PASSWORD, nom: 'Développeur Démo' },
} as const;
export type Compte = (typeof COMPTES)[keyof typeof COMPTES];

/** Jeux de démo. */
export const JEUX = {
  crystal: { id: 'gam_crystal', slug: 'crystal-clash', nom: 'Crystal Clash' },
  farm: { id: 'gam_farm', slug: 'pixel-farm', nom: 'Pixel Farm' },
} as const;

/** Articles de démo utilisés par les parcours. */
export const ARTICLES = {
  sacDeGemmes: { id: 'itm_crystal_gems_1200', productId: 'gems_1200', titre: 'Sac de gemmes', quantite: 1200 },
} as const;

/** Joueurs fictifs du jeu de démo (apps/demo-game/src/catalog.ts). */
export const JOUEURS_DEMO = {
  ali: { id: '#2PP8QL9', nom: 'Ali' },
  lea: { id: '#9LQ2YVR', nom: 'Léa' },
  sam: { id: '#8VJR2KX', nom: 'Sam' },
} as const;
