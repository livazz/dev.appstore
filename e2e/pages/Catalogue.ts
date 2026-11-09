import { expect, type Locator, type Page } from '@playwright/test';
import { contient } from '../support/text';

/** `/` catalogue et `/search?q=` (tâche « catalog »). */
export class Catalogue {
  /** Barre de recherche de l'en-tête (formulaire role="search"). */
  readonly recherche: Locator;
  readonly champRecherche: Locator;

  constructor(readonly page: Page) {
    this.recherche = page.getByRole('search').first();
    this.champRecherche = this.recherche.getByLabel(/rechercher/i).first();
  }

  async ouvrir() {
    await this.page.goto('/');
    await expect(this.champRecherche).toBeVisible();
  }

  /** Saisit la recherche dans l'en-tête et valide (Entrée). */
  async rechercher(terme: string) {
    await this.champRecherche.fill(terme);
    await this.champRecherche.press('Enter');
    await expect(this.page).toHaveURL(/\/search\?/);
    await expect(this.page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  }

  /** Lien vers la page d'un jeu dans les résultats ou le catalogue. */
  lienJeu(nom: string): Locator {
    return this.page.getByRole('main').first().getByRole('link', { name: contient(nom) }).first();
  }

  async ouvrirJeu(nom: string) {
    await this.lienJeu(nom).click();
    await expect(this.page).toHaveURL(/\/games\/[^/?]+(\?|$)/);
    await expect(this.page.getByRole('heading', { level: 1, name: nom })).toBeVisible();
  }
}
