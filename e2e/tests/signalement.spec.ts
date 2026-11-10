/*
 * Signalement d'un contenu hors charte (DSA art. 16) : un visiteur non connecté signale un article depuis la boutique,
 * reçoit l'accusé de réception à l'écran ; un administrateur voit le signalement dans /admin/reports et le classe
 * sans suite avec un motif.
 */
import { COMPTES, JEUX } from '../support/demo-data';
import { expect, exigeRoutes, test } from '../support/fixtures';

test.describe('Signalement de contenu', () => {
  exigeRoutes('/games/[slug]/report', '/admin/reports', '/login');

  test('un visiteur signale un jeu, un admin le classe sans suite', async ({ page, connexion }) => {
    const unique = `${Date.now()}`;
    const email = `signalant-${unique}@exemple.test`;
    const explication = `Le prix barré du pack est fictif, aucune vente à ce prix n’a existé (réf. e2e ${unique}).`;
    // Le formulaire du signalement (l'en-tête a aussi un sélecteur « Catégorie » pour la recherche).
    const remplir = async () => {
      const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Envoyer le signalement' }) });
      await form.getByLabel(/Catégorie/).selectOption('fraud');
      await form.getByLabel(/Article visé/).selectOption({ label: 'Sac de gemmes' });
      await form.getByLabel(/Explication/).fill(explication);
      await form.getByLabel(/Votre adresse e-mail/).fill(email);
      await form.getByLabel(/Je déclare de bonne foi/).check();
      await form.getByRole('button', { name: 'Envoyer le signalement' }).click();
    };

    // 1. Visiteur : lien discret en bas de la boutique → formulaire.
    await page.goto(`/games/${JEUX.crystal.slug}`);
    await page.getByRole('link', { name: 'Signaler ce contenu' }).click();
    await expect(page).toHaveURL(new RegExp(`/games/${JEUX.crystal.slug}/report`));
    await expect(page.getByRole('heading', { name: 'Signaler ce contenu' })).toBeVisible();

    await remplir();

    const recu = page.getByRole('status').filter({ hasText: 'Signalement reçu' });
    await expect(recu).toBeVisible();
    await expect(recu).toContainText(email);
    await expect(recu).toContainText(/rpt_/);

    // Même signalement une deuxième fois : refusé (anti-doublon).
    await page.goto(`/games/${JEUX.crystal.slug}/report`);
    await remplir();
    await expect(page.getByRole('alert').filter({ hasText: 'déjà signalé' })).toBeVisible();

    // 2. Admin : le signalement apparaît, regroupé sous le jeu.
    await connexion.seConnecter(COMPTES.dev, '/admin/reports');
    await page.goto('/admin/reports');
    await expect(page.getByRole('heading', { name: 'Signalements', level: 1 })).toBeVisible();
    const signalement = page.getByRole('listitem').filter({ hasText: explication });
    await expect(signalement).toBeVisible();
    await expect(signalement).toContainText(email);
    await expect(signalement).toContainText('Sac de gemmes');

    const carte = page.locator('section').filter({ has: signalement });
    await expect(carte.getByRole('link', { name: 'Suspendre le jeu…' })).toHaveAttribute('href', new RegExp(`^/admin/games/${JEUX.crystal.id}\\?ground=\\w+#moderation$`));

    // 3. Classer sans suite (confirmation du navigateur acceptée).
    page.once('dialog', (d) => void d.accept());
    await carte.getByLabel(/Motif communiqué aux signalants/).fill('Prix barré justifié par l’historique de prix fourni par le studio.');
    await carte.getByRole('button', { name: 'Classer sans suite' }).click();
    await expect(carte.getByRole('status')).toContainText('classé');

    await page.reload();
    await expect(page.getByRole('listitem').filter({ hasText: explication })).toHaveCount(0);
  });
});
