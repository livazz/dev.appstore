/*
 * `test` étendu : page objects prêts à l'emploi + gardes « module pas encore fusionné ».
 *
 *   import { test, expect, exigeRoutes } from '../support/fixtures';
 *   test.describe('…', () => {
 *     exigeRoutes('/login', 'POST /api/v1/link-codes');   // → test.fixme tant qu'une route manque
 *     test('…', async ({ connexion, pageJeu }) => { … });
 *   });
 */
import { test as base, expect } from '@playwright/test';
import { Catalogue } from '../pages/Catalogue';
import { Compte } from '../pages/Compte';
import { Connexion } from '../pages/Connexion';
import { Integration } from '../pages/Integration';
import { JeuDemo } from '../pages/JeuDemo';
import { Liaison } from '../pages/Liaison';
import { PageJeu } from '../pages/PageJeu';
import { PaiementSimule } from '../pages/PaiementSimule';
import { StudioEditeur } from '../pages/StudioEditeur';
import { demoGameAvailable } from './env';
import { fixmeReason, missingRoutes } from './routes';

export interface PagesDevAppStore {
  connexion: Connexion;
  catalogue: Catalogue;
  pageJeu: PageJeu;
  liaison: Liaison;
  paiement: PaiementSimule;
  compte: Compte;
  studio: StudioEditeur;
  integration: Integration;
}

export const test = base.extend<PagesDevAppStore>({
  connexion: async ({ page }, use) => use(new Connexion(page)),
  catalogue: async ({ page }, use) => use(new Catalogue(page)),
  pageJeu: async ({ page }, use) => use(new PageJeu(page)),
  liaison: async ({ page }, use) => use(new Liaison(page)),
  paiement: async ({ page }, use) => use(new PaiementSimule(page)),
  compte: async ({ page }, use) => use(new Compte(page)),
  studio: async ({ page }, use) => use(new StudioEditeur(page)),
  integration: async ({ page }, use) => use(new Integration(page)),
});

export { expect, JeuDemo };

/** E2E_FORCER=1 : exécute aussi les specs « fixme » (pour voir jusqu'où va un parcours pendant l'intégration). */
const FORCER = process.env.E2E_FORCER === '1';

/**
 * Marque le groupe (appel dans `test.describe`) ou le test (appel dans son corps) `fixme` si une des routes
 * manque dans apps/web/src/app. Formats : `'/games/[slug]/link'` (page) ou `'POST /api/v1/link-codes'` (handler).
 */
export function exigeRoutes(...routes: string[]) {
  if (FORCER) return;
  const missing = missingRoutes(routes);
  test.fixme(missing.length > 0, fixmeReason(missing));
}

/** Marque `fixme` si le jeu de démo (apps/demo-game, `npm run demo`) n'existe pas dans ce worktree. */
export function exigeJeuDemo() {
  if (FORCER) return;
  test.fixme(!demoGameAvailable(), 'Jeu de démo absent de ce worktree (apps/demo-game / script « npm run demo »).');
}
