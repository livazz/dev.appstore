/*
 * Espace studio : dev@wolleen.test ouvre l'éditeur de Crystal Clash, ajoute un article,
 * et l'article apparaît sur la boutique publique /games/crystal-clash.
 */
import { COMPTES, JEUX } from '../support/demo-data';
import { expect, exigeRoutes, test } from '../support/fixtures';

test.describe('Studio éditeur', () => {
  exigeRoutes('/login', '/studio', '/studio/games/[id]', '/games/[slug]');

  test('ajout d\'un article visible sur la page publique', async ({ connexion, studio, pageJeu }) => {
    const titre = `Potion E2E ${Date.now().toString(36).toUpperCase()}`;

    await connexion.seConnecter(COMPTES.dev);

    await test.step('Mes jeux → éditeur de Crystal Clash', async () => {
      await studio.ouvrirAccueil();
      await studio.ouvrirJeu(JEUX.crystal.nom);
    });

    await test.step(`ajout de l'article « ${titre} »`, async () => {
      await studio.ajouterArticle({ titre, sousTitre: 'Ajouté par les tests e2e', prixCents: 199 });
    });

    await test.step('visible sur la boutique publique', async () => {
      await expect(async () => {
        await pageJeu.ouvrir(JEUX.crystal.slug);
        await expect(pageJeu.carteArticle(titre)).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
      await pageJeu.carteArticle(titre).click();
      await expect(pageJeu.detail(titre)).toContainText(/1,99/);
    });
  });
});
