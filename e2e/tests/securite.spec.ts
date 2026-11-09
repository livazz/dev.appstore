/*
 * Contrôles de sécurité de bout en bout (docs/security/review-checklist.md) :
 * - CHK-MT-01/07, CHK-AUTH-02 : un joueur (ou un cookie forgé) n'accède pas à l'espace studio d'un jeu ;
 * - CHK-API-01/04 : l'API v1 répond 401 sans clé, avec une clé inconnue, hors schéma Bearer, clé en query string ;
 * - T-LNK : un code de liaison est à usage unique.
 */
import type { Page, Response } from '@playwright/test';
import { ApiJeu } from '../support/api';
import { COMPTES, JEUX, demoKeys } from '../support/demo-data';
import { BASE_URL } from '../support/env';
import { Connexion } from '../pages/Connexion';
import { Liaison } from '../pages/Liaison';
import { StudioEditeur } from '../pages/StudioEditeur';
import { expect, exigeRoutes, test } from '../support/fixtures';

/** La page studio est refusée : 401/403/404 ou renvoi vers /login, et aucun outil d'édition n'est rendu. */
async function attendreRefus(page: Page, res: Response | null) {
  const status = res?.status() ?? 0;
  const versLogin = new URL(page.url()).pathname === '/login';
  expect(versLogin || [401, 403, 404].includes(status), `statut ${status} sur ${page.url()}`).toBe(true);
  await expect(new StudioEditeur(page).boutonAjouterArticle).toHaveCount(0);
  await expect(page.getByText(/wk_secret_|wk_test_|whsec_/)).toHaveCount(0);
}

test.describe('Sécurité — espace studio', () => {
  test('un joueur connecté ne peut pas ouvrir l\'éditeur ni l\'intégration d\'un jeu', async ({ page, connexion, studio }) => {
    exigeRoutes('/login', '/studio', '/studio/games/[id]');
    await connexion.seConnecter(COMPTES.joueur);

    // « Mes jeux » ne liste aucun jeu du studio Nova Games.
    await studio.ouvrirAccueil();
    await expect(page.locator(`a[href="/studio/games/${JEUX.crystal.id}"]`)).toHaveCount(0);

    await attendreRefus(page, await page.goto(`/studio/games/${JEUX.crystal.id}`));
    await attendreRefus(page, await page.goto(`/studio/games/${JEUX.crystal.id}/integration`));
  });

  test('un cookie de session forgé ne donne pas accès au studio (CHK-AUTH-02)', async ({ page, context }) => {
    exigeRoutes('/login', '/studio/games/[id]');
    await context.addCookies([
      { name: 'wolleen_demo_user', value: 'usr_demo_dev', url: BASE_URL },
      { name: 'better-auth.session_token', value: 'jeton-aleatoire-forge', url: BASE_URL },
    ]);
    await attendreRefus(page, await page.goto(`/studio/games/${JEUX.crystal.id}`));
  });
});

test.describe('Sécurité — API v1 sans clé valide → 401 (CHK-API-01, CHK-API-04)', () => {
  const endpoints = [
    { route: 'POST /api/v1/link-codes', method: 'post', path: '/api/v1/link-codes', data: { player_id: 'E2E-SECU' } },
    { route: 'GET /api/v1/deliveries', method: 'get', path: '/api/v1/deliveries?player_id=E2E-SECU' },
    { route: 'GET /api/v1/deliveries/stream', method: 'get', path: '/api/v1/deliveries/stream?player_id=E2E-SECU' },
    { route: 'POST /api/v1/deliveries/[id]/ack', method: 'post', path: '/api/v1/deliveries/dlv_inexistant/ack' },
  ] as const;

  const variantes: { nom: string; headers: () => Record<string, string>; query?: () => string }[] = [
    { nom: 'sans en-tête Authorization', headers: () => ({}) },
    { nom: 'clé inconnue', headers: () => ({ authorization: 'Bearer wk_faux_0000000000000000' }) },
    { nom: 'schéma autre que Bearer', headers: () => ({ authorization: `Basic ${demoKeys().crystal.apiKey}` }) },
    { nom: 'clé valide passée en query string', headers: () => ({}), query: () => `api_key=${demoKeys().crystal.apiKey}` },
  ];

  for (const e of endpoints) {
    for (const v of variantes) {
      test(`${e.route} — ${v.nom}`, async ({ request }) => {
        exigeRoutes(e.route);
        const q = v.query?.();
        const url = `${BASE_URL}${e.path}${q ? `${e.path.includes('?') ? '&' : '?'}${q}` : ''}`;
        const res =
          e.method === 'post'
            ? await request.post(url, { headers: v.headers(), data: 'data' in e ? e.data : {}, timeout: 15_000 })
            : await request.get(url, { headers: v.headers(), timeout: 15_000 });
        expect(res.status()).toBe(401);
        const body = await res.text();
        expect(body).not.toMatch(/at\s+\S+\s+\(|node_modules|Error:/); // pas de pile ni d'exception brute
      });
    }
  }
});

test.describe('Sécurité — codes de liaison', () => {
  exigeRoutes('/login', '/games/[slug]/link', 'POST /api/v1/link-codes');

  test('un code de liaison déjà utilisé est refusé', async ({ browser, page, request }) => {
    // Pixel Farm : jeu qu'aucune autre spec ne lie, donc indépendant de l'ordre d'exécution.
    const api = new ApiJeu(request, 'farm');
    const { code } = await api.creerCodeLiaison(`E2E-REUSE-${Date.now()}`, 'Testeur e2e');

    await test.step('premier usage (joueur@wolleen.test) : accepté', async () => {
      await new Connexion(page).seConnecter(COMPTES.joueur);
      const liaison = new Liaison(page);
      await liaison.ouvrir(JEUX.farm.slug, { changer: true });
      await liaison.lierParCode(code);
    });

    await test.step('second usage (dev@wolleen.test) : refusé', async () => {
      const autre = await browser.newContext({ baseURL: BASE_URL, locale: 'fr-FR' });
      try {
        const p = await autre.newPage();
        await new Connexion(p).seConnecter(COMPTES.dev);
        const liaison = new Liaison(p);
        await liaison.ouvrir(JEUX.farm.slug, { changer: true });
        await liaison.saisirCode(code);
        await expect(liaison.erreur).toContainText(/invalide|expiré|déjà utilisé/i);
        await expect(p).toHaveURL(/\/games\/pixel-farm\/link/);
      } finally {
        await autre.close();
      }
    });

    await test.step('rejeu par le même joueur : refusé', async () => {
      const liaison = new Liaison(page);
      await liaison.ouvrir(JEUX.farm.slug, { changer: true });
      await liaison.saisirCode(code);
      await expect(liaison.erreur).toContainText(/invalide|expiré|déjà utilisé/i);
    });
  });
});
