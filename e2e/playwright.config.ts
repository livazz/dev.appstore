import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';
import {
  BASE_URL,
  DEMO_GAME_URL,
  DEMO_PORT,
  REPO_ROOT,
  REUSE_SERVER,
  WEB_PORT,
  demoGameAvailable,
  webServerEnv,
} from './support/env';

/*
 * Tests de bout en bout de Wolleen — voir e2e/README.md.
 *
 *   npm run test:e2e                    # depuis la racine
 *   npm run test:e2e -- --trace on      # avec traces (désactivées par défaut)
 *   E2E_REUSE_SERVER=1 npm run test:e2e # réutilise des serveurs déjà lancés
 */

const webServer: NonNullable<PlaywrightTestConfig['webServer']> = [
  {
    name: 'wolleen',
    // Port 3000 par défaut ; E2E_WEB_PORT=… si 3000 est déjà pris (le dernier -p passé à `next dev` l'emporte).
    command: WEB_PORT === 3000 ? 'npm run dev' : `npm run dev -w @wolleen/web -- -p ${WEB_PORT}`,
    cwd: REPO_ROOT,
    // Sonde qui ne touche pas la base (cf. global-setup.ts).
    url: `${BASE_URL}/favicon.ico`,
    env: webServerEnv(),
    reuseExistingServer: REUSE_SERVER,
    timeout: 180_000,
    stdout: process.env.E2E_SERVER_LOGS === '1' ? 'pipe' : 'ignore',
    stderr: 'pipe',
  },
];

if (demoGameAvailable()) {
  webServer.push({
    name: 'jeu-demo',
    command: 'npm run demo',
    cwd: REPO_ROOT,
    url: `${DEMO_GAME_URL}/api/config`,
    env: { PORT: String(DEMO_PORT), WOLLEEN_URL: BASE_URL },
    reuseExistingServer: REUSE_SERVER,
    timeout: 60_000,
    stdout: process.env.E2E_SERVER_LOGS === '1' ? 'pipe' : 'ignore',
    stderr: 'pipe',
  });
}

/** Navigateur préinstallé (/opt/pw-browsers) si la révision attendue par @playwright/test n'est pas disponible. */
const executablePath = process.env.E2E_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  outputDir: './test-results',
  // Les specs partagent une base et des comptes de démo : exécution en série, dans l'ordre des fichiers.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Le premier rendu de chaque route en `next dev` compile à la volée : délais généreux.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(executablePath ? { launchOptions: { executablePath } } : {}) },
    },
  ],
  webServer,
});
