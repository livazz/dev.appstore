/*
 * Parcours joueur complet : connexion → recherche → page du jeu → Acheter → liaison par code → paiement simulé
 * → le jeu reçoit l'achat tout seul → /account/purchases affiche « Livré ».
 */
import { ApiJeu, inventaireJeuDemo } from '../support/api';
import { ARTICLES, COMPTES, JEUX, JOUEURS_DEMO } from '../support/demo-data';
import { demoGameAvailable } from '../support/env';
import { JeuDemo, expect, exigeRoutes, test } from '../support/fixtures';

test.describe('Parcours joueur', () => {
  exigeRoutes(
    '/login',
    '/search',
    '/games/[slug]',
    '/games/[slug]/link',
    'POST /api/checkout',
    '/checkout/mock',
    '/checkout/success',
    '/account/purchases',
    'POST /api/v1/link-codes',
    'GET /api/v1/deliveries',
    'POST /api/v1/deliveries/[id]/ack',
  );

  test('recherche « Crystal », achat du Sac de gemmes, liaison par code, livraison automatique', async ({
    page,
    context,
    request,
    connexion,
    catalogue,
    pageJeu,
    liaison,
    paiement,
    compte,
  }) => {
    const article = ARTICLES.sacDeGemmes;
    const joueurJeu = JOUEURS_DEMO.lea; // compte de jeu crédité (connu du jeu de démo)
    const api = new ApiJeu(request, 'crystal');
    const avecJeuDemo = demoGameAvailable();

    // Le jeu tourne déjà avant l'achat : il ne sera jamais rechargé.
    let jeu: JeuDemo | undefined;
    let gemmesAvant = 0;
    if (avecJeuDemo) {
      jeu = new JeuDemo(await context.newPage());
      await jeu.ouvrir('crystal', joueurJeu.id);
      gemmesAvant = (await inventaireJeuDemo(request, 'crystal', joueurJeu.id)).gems ?? 0;
      await page.bringToFront();
    }

    await test.step('connexion du joueur', async () => {
      await connexion.seConnecter(COMPTES.joueur);
    });

    await test.step('recherche « Crystal » → page du jeu', async () => {
      await catalogue.ouvrir();
      await catalogue.rechercher('Crystal');
      await catalogue.ouvrirJeu(JEUX.crystal.nom);
    });

    await test.step(`Acheter « ${article.titre} » → liaison demandée`, async () => {
      // Le compte joueur de démo est déjà lié (seed) : on passe par « Changer » pour lier le compte de Léa.
      await pageJeu.allerALaLiaison(article.titre);
      await liaison.attendre();
      await liaison.changerSiDejaLie();
    });

    await test.step('liaison par code (code généré par le jeu via POST /api/v1/link-codes)', async () => {
      const { code } = await api.creerCodeLiaison(joueurJeu.id, joueurJeu.nom);
      await liaison.lierParCode(code);
    });

    await test.step('reprise de l\'achat → paiement simulé', async () => {
      // Après la liaison, retour sur la boutique (article rouvert ou non) ou directement au paiement.
      await page.waitForURL((u) => /\/checkout\/mock|\/games\/[^/]+$/.test(u.pathname));
      if (!/\/checkout\/mock/.test(page.url())) await pageJeu.acheter(article.titre);
      await paiement.attendre();
      await expect(page.getByRole('main').first()).toContainText(article.titre);
      await paiement.payer();
    });

    await test.step('le jeu reçoit l\'achat sans rechargement manuel', async () => {
      if (jeu) {
        // Webhook signé → serveur du jeu → page du jeu (SSE), puis ack en tâche de fond.
        await jeu.attendreAchat(article.titre);
        await expect
          .poll(async () => (await inventaireJeuDemo(request, 'crystal', joueurJeu.id)).gems, { timeout: 30_000 })
          .toBe(gemmesAvant + article.quantite);
      } else {
        // Pas de jeu de démo : le test joue le rôle du jeu (SDK) — interroge l'API puis acquitte.
        const livraison = await api.attendreLivraison(joueurJeu.id, article.productId);
        expect(livraison).toMatchObject({ game_id: JEUX.crystal.id, player_id: joueurJeu.id, quantity: article.quantite });
        await api.acquitter(livraison.delivery_id);
      }
      // La page de confirmation se met à jour toute seule.
      await paiement.attendreLivre();
    });

    await test.step('/account/purchases affiche « Livré » ou « Confirmé dans le jeu »', async () => {
      await compte.attendreStatut(article.titre, /livré|confirmé dans le jeu/i);
    });
  });
});
