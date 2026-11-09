import { expect, type Locator, type Page } from '@playwright/test';
import type { Compte } from '../support/demo-data';

/** /login — connexion par e-mail et mot de passe (tâche « auth »). */
export class Connexion {
  readonly email: Locator;
  readonly motDePasse: Locator;
  readonly boutonConnexion: Locator;
  readonly erreur: Locator;

  constructor(readonly page: Page) {
    this.email = page.getByLabel(/e-mail/i);
    this.motDePasse = page.getByLabel(/mot de passe/i);
    // Bouton du formulaire (l'en-tête a aussi un LIEN « Se connecter »).
    this.boutonConnexion = page.getByRole('button', { name: /^se connecter$/i });
    this.erreur = page.getByRole('alert');
  }

  async ouvrir(next?: string) {
    await this.page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
    await expect(this.email).toBeVisible();
  }

  /** Se connecte et attend d'avoir quitté /login. */
  async seConnecter(compte: Pick<Compte, 'email' | 'password'>, next?: string) {
    await this.ouvrir(next);
    await this.email.fill(compte.email);
    await this.motDePasse.fill(compte.password);
    await this.boutonConnexion.click();
    await expect(this.page).not.toHaveURL(/\/login(\?|$)/);
  }
}
