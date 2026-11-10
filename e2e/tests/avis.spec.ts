/*
 * Avis des joueurs : un visiteur voit la note et la liste (avis de démo du seed) avec le lien de connexion ; un joueur
 * connecté publie, modifie puis supprime son avis ; un administrateur le masque dans /admin/reviews et le joueur en
 * est informé.
 */
import { Connexion } from '../pages/Connexion';
import { COMPTES, JEUX } from '../support/demo-data';
import { expect, exigeRoutes, test } from '../support/fixtures';

test.describe('Avis des joueurs', () => {
  exigeRoutes('/games/[slug]', '/admin/reviews', '/login');

  test('lecture, publication, modération et suppression d’un avis', async ({ page, browser, connexion }) => {
    const unique = `${Date.now()}`;
    const texte = `Les duels sont intenses et le pack de gemmes est arrivé tout de suite (e2e ${unique}).`;
    const section = page.locator('section#avis');

    // 1. Visiteur : synthèse et avis de démo, lien de connexion.
    await page.goto(`/games/${JEUX.crystal.slug}`);
    await expect(section.getByRole('heading', { name: 'Avis des joueurs' })).toBeVisible();
    await expect(section.getByTestId('reviews-count')).toContainText(/\d+ avis/);
    await expect(section.getByRole('list', { name: 'Répartition des notes' }).getByRole('listitem')).toHaveCount(5);
    await expect(section.getByTestId('review')).toHaveCount(10);
    await expect(section.getByRole('link', { name: 'Connectez-vous pour donner votre avis' })).toBeVisible();
    // Pagination : 10 de plus (ou le reste).
    const plus = section.getByRole('button', { name: 'Afficher plus d’avis' });
    if (await plus.isVisible()) {
      await plus.click();
      await expect.poll(() => section.getByTestId('review').count()).toBeGreaterThan(10);
    }

    // 2. Joueur : publication (note + texte), puis modification.
    await connexion.seConnecter(COMPTES.joueur, `/games/${JEUX.crystal.slug}`);
    await page.goto(`/games/${JEUX.crystal.slug}#avis`);
    const form = section.getByRole('form', { name: /Votre avis sur/ });
    await form.getByRole('radio', { name: /^4 étoiles/ }).check({ force: true });
    await form.getByLabel('Votre avis').fill(texte);
    await form.getByRole('button', { name: 'Publier mon avis' }).click();
    await expect(section.getByRole('status').filter({ hasText: 'Votre avis est publié' })).toBeVisible();
    const mien = section.getByTestId('review').filter({ hasText: texte });
    await expect(mien).toBeVisible();
    await expect(mien).toContainText('Votre avis');
    await expect(mien).toContainText('Joueur D.');

    await section.getByRole('button', { name: 'Modifier mon avis' }).click();
    await form.getByRole('radio', { name: /^5 étoiles/ }).check({ force: true });
    await form.getByRole('button', { name: 'Enregistrer les modifications' }).click();
    await expect(section.getByRole('status').filter({ hasText: 'Votre avis a été modifié' })).toBeVisible();
    await expect(mien.getByRole('img', { name: '5 sur 5' })).toBeVisible();

    // 3. Admin (autre session) : masque l'avis, journalisé.
    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await new Connexion(admin).seConnecter(COMPTES.dev, '/admin/reviews');
    await admin.goto(`/admin/reviews?q=${encodeURIComponent(unique)}`);
    const carte = admin.getByRole('listitem').filter({ hasText: texte });
    await expect(carte).toContainText('Visible');
    admin.once('dialog', (d) => void d.accept());
    await carte.getByLabel(/Motif/).fill('Test e2e');
    await carte.getByRole('button', { name: 'Masquer' }).click();
    await expect(carte.getByRole('status')).toHaveText('Avis masqué.');
    await expect(carte.getByRole('button', { name: 'Réafficher' })).toBeVisible();
    await adminCtx.close();

    // 4. Joueur : l'avis n'est plus listé, le joueur est prévenu ; il le supprime.
    await page.reload();
    await expect(section.getByTestId('review').filter({ hasText: texte })).toHaveCount(0);
    await expect(section.getByText('masqué par la modération')).toBeVisible();
    page.once('dialog', (d) => void d.accept());
    await section.getByRole('button', { name: 'Supprimer mon avis' }).click();
    await expect(section.getByRole('status').filter({ hasText: 'Votre avis a été supprimé' })).toBeVisible();
    await expect(section.getByRole('button', { name: 'Publier mon avis' })).toBeVisible();
  });
});
