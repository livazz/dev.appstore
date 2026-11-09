/*
 * Liaison par identifiant joueur (méthode id_confirm) : Dev AppStore interroge le serveur du jeu
 * (games.playerLookupUrl → jeu de démo, http://localhost:4100/devappstore/players/{id}) et affiche
 * « Est-ce bien vous : <nom> ? ».
 *
 * Compte Dev AppStore utilisé : dev@devappstore.test — joueur@devappstore.test reste NON lié à Crystal Clash pour que
 * parcours-joueur.spec.ts passe par l'écran de liaison par code.
 */
import { COMPTES, JEUX, JOUEURS_DEMO } from '../support/demo-data';
import { expect, exigeJeuDemo, exigeRoutes, test } from '../support/fixtures';

test.describe('Liaison par identifiant joueur (id_confirm)', () => {
  exigeRoutes('/login', '/games/[slug]/link');
  exigeJeuDemo();

  test('le joueur #2PP8QL9 voit « Est-ce bien vous » puis confirme', async ({ page, connexion, liaison }) => {
    const joueurJeu = JOUEURS_DEMO.ali;

    await connexion.seConnecter(COMPTES.dev);
    await liaison.ouvrir(JEUX.crystal.slug);
    await expect(liaison.sectionId).toBeVisible();

    await test.step('recherche de l\'identifiant', async () => {
      await liaison.rechercherJoueur(joueurJeu.id);
    });

    await test.step('écran « Est-ce bien vous »', async () => {
      await expect(liaison.ecranConfirmation()).toBeVisible();
      await expect(liaison.ecranConfirmation()).toContainText(joueurJeu.nom);
      await expect(liaison.sectionId.getByRole('button', { name: /oui, c.est moi/i })).toBeVisible();
    });

    await test.step('confirmation → compte lié (déclaratif, non vérifié)', async () => {
      await liaison.confirmerJoueur();
      await liaison.ouvrir(JEUX.crystal.slug);
      await expect(liaison.compteLie).toBeVisible();
      await expect(liaison.compteLie).toContainText(joueurJeu.id);
      await expect(liaison.compteLie).toContainText(/non vérifié/i);
      await expect(page).toHaveURL(/\/games\/crystal-clash\/link/);
    });
  });

  test('un identifiant inconnu du jeu est refusé', async ({ connexion, liaison }) => {
    await connexion.seConnecter(COMPTES.dev);
    await liaison.ouvrir(JEUX.crystal.slug, { changer: true });
    await liaison.rechercherJoueur('#INCONNU0');
    await expect(liaison.erreur).toContainText(/aucun joueur/i);
    await expect(liaison.ecranConfirmation()).toHaveCount(0);
  });
});
