/*
 * Paramètres communs du harnais e2e (config Playwright, globalSetup, specs).
 * Tout est surchargeable par variable d'environnement — voir e2e/README.md.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Dossier e2e/ (ce fichier est dans e2e/support/). */
export const E2E_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Racine du monorepo. */
export const REPO_ROOT = resolve(E2E_DIR, '..');
/** Dossier de l'application Next.js (App Router). */
export const WEB_APP_DIR = resolve(REPO_ROOT, 'apps/web/src/app');

export const WEB_PORT = Number(process.env.E2E_WEB_PORT || 3000);
export const DEMO_PORT = Number(process.env.E2E_DEMO_PORT || 4100);
/** URL de Dev AppStore (site + API). */
export const BASE_URL = (process.env.E2E_BASE_URL || `http://localhost:${WEB_PORT}`).replace(/\/+$/, '');
/** URL du jeu de démo (apps/demo-game). */
export const DEMO_GAME_URL = (process.env.E2E_DEMO_URL || `http://localhost:${DEMO_PORT}`).replace(/\/+$/, '');

/**
 * Base PGlite isolée des tests (jamais le .data/ du développeur). Chemin ABSOLU : drizzle-kit s'exécute depuis
 * packages/db et interpréterait un chemin relatif depuis ce dossier.
 */
export const DATA_DIR = resolve(REPO_ROOT, process.env.E2E_DATA_DIR || 'e2e/.data');

/**
 * Copies des e-mails envoyés par le serveur de test (transport console) : les specs y lisent les liens à jeton
 * (vérification d'adresse, réinitialisation du mot de passe). Fichiers `<horodatage>-<objet>.txt` : « À : … », « Objet : … ».
 */
export const MAILS_DIR = resolve(DATA_DIR, 'mails');

/**
 * Réutiliser des serveurs déjà lancés (E2E_REUSE_SERVER=1). Dans ce cas le globalSetup ne touche PAS à la base :
 * le serveur existant la tient ouverte — c'est à vous de l'avoir lancé avec DEVAPPSTORE_DATA_DIR=e2e/.data, migrée et seedée.
 */
export const REUSE_SERVER = process.env.E2E_REUSE_SERVER === '1';

/** Le jeu de démo est-il présent dans ce dépôt (script racine `npm run demo` ou apps/demo-game) ? */
export function demoGameAvailable(root = REPO_ROOT): boolean {
  if (process.env.E2E_DEMO_GAME === '0') return false;
  if (existsSync(resolve(root, 'apps/demo-game/package.json'))) return true;
  try {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    return Boolean(pkg.scripts?.demo);
  } catch {
    return false;
  }
}

/** Variables passées au serveur Next.js de test. */
export function webServerEnv(): Record<string, string> {
  return {
    DEVAPPSTORE_DATA_DIR: DATA_DIR,
    // Force PGlite même si le développeur a un DATABASE_URL dans son shell.
    DATABASE_URL: '',
    // Mode simulation des paiements (/checkout/mock).
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: '',
    APP_URL: BASE_URL,
    BETTER_AUTH_URL: BASE_URL,
    BETTER_AUTH_TRUSTED_ORIGINS: BASE_URL,
    // Secrets de TEST uniquement (≥ 32 caractères pour passer la validation de configuration).
    AUTH_SECRET: process.env.E2E_AUTH_SECRET || 'e2e-secret-de-test-uniquement-0123456789abcdef',
    CRON_SECRET: process.env.E2E_CRON_SECRET || 'e2e-cron-secret-de-test-0123456789',
    NEXT_TELEMETRY_DISABLED: '1',
    // E-mails : jamais envoyés, copiés dans e2e/.data/mails (liens lus par les specs).
    MAIL_TRANSPORT: 'console',
    RESEND_API_KEY: '',
    MAIL_CONSOLE_DIR: MAILS_DIR,
  };
}
