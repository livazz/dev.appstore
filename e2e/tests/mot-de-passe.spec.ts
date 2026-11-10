/*
 * Revue de sécurité A-04 / A-07 : inscription (réponse neutre, e-mail de vérification), confirmation de l'adresse,
 * mot de passe oublié → lien reçu par e-mail → nouveau mot de passe → connexion.
 * Les liens sont lus dans les copies des e-mails du transport console (e2e/.data/mails, cf. support/mails.ts).
 */
import { BASE_URL } from '../support/env';
import { attendreLien } from '../support/mails';
import { expect, exigeRoutes, test } from '../support/fixtures';

test.describe('Compte : vérification d’adresse et mot de passe oublié', () => {
  test('inscription → confirmation → mot de passe oublié → nouveau mot de passe → connexion', async ({ page, context, connexion }) => {
    exigeRoutes('/signup', '/login', '/forgot-password', '/reset-password', '/verify-email');
    const email = `mdp-${Date.now()}@exemple.test`;

    await test.step('inscription : « Vérifiez votre boîte mail », aucune session', async () => {
      await page.goto('/signup');
      await page.getByLabel('Nom', { exact: true }).fill('Camille');
      await page.getByLabel('Adresse e-mail').fill(email);
      await page.getByLabel('Mot de passe', { exact: true }).fill('ancien-mdp-123');
      await page.getByRole('button', { name: 'Créer mon compte' }).click();
      await expect(page.getByText('Vérifiez votre boîte mail')).toBeVisible();
    });

    await test.step('le lien de vérification confirme l’adresse et connecte', async () => {
      const lien = await attendreLien(email, /Confirmez votre adresse/);
      expect(lien.startsWith(`${BASE_URL}/api/auth/verify-email?token=`)).toBe(true);
      await page.goto(lien);
      await expect(page).toHaveURL(/\/verify-email\?done=1$/);
      await expect(page.getByRole('heading', { name: 'Adresse confirmée' })).toBeVisible();
      await context.clearCookies();
    });

    await test.step('« Mot de passe oublié ? » : réponse neutre', async () => {
      await connexion.ouvrir();
      await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
      await expect(page).toHaveURL(/\/forgot-password$/);
      await page.getByLabel('Adresse e-mail').fill(email);
      await page.getByRole('button', { name: 'Recevoir le lien' }).click();
      await expect(page.getByText('Demande envoyée')).toBeVisible();
    });

    await test.step('lien reçu → nouveau mot de passe → retour à la connexion', async () => {
      const lien = await attendreLien(email, /Réinitialisation de votre mot de passe/);
      expect(lien.startsWith(`${BASE_URL}/reset-password?token=`)).toBe(true);
      await page.goto(lien);
      await page.locator('input[name="password"]').fill('nouveau-mdp-456');
      await page.locator('input[name="confirmPassword"]').fill('nouveau-mdp-456');
      await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
      await expect(page).toHaveURL(/\/login\?reset=1$/);
      await expect(page.getByText(/Mot de passe modifié/)).toBeVisible();

      // Le lien ne sert qu'une fois.
      await page.goto(lien);
      await page.locator('input[name="password"]').fill('pirate-mdp-789');
      await page.locator('input[name="confirmPassword"]').fill('pirate-mdp-789');
      await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
      await expect(page.getByText(/Ce lien n’est plus valable/)).toBeVisible();
    });

    await test.step('connexion avec le nouveau mot de passe (l’ancien est refusé)', async () => {
      await connexion.ouvrir();
      await connexion.email.fill(email);
      await connexion.motDePasse.fill('ancien-mdp-123');
      await connexion.boutonConnexion.click();
      await expect(page.getByText('E-mail ou mot de passe incorrect.')).toBeVisible();
      await connexion.motDePasse.fill('nouveau-mdp-456');
      await connexion.boutonConnexion.click();
      await expect(page).not.toHaveURL(/\/login(\?|$)/);
      await expect(page.getByText(/Confirmez votre adresse/)).toHaveCount(0);
    });
  });
});
