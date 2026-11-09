import { expect, type Locator, type Page } from '@playwright/test';

/** `/account` (jeux liés, tâche « linking ») et `/account/purchases` (historique, tâche « analytics »). */
export class Compte {
  constructor(readonly page: Page) {}

  async ouvrir() {
    await this.page.goto('/account');
    await expect(this.page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  }

  async ouvrirAchats() {
    await this.page.goto('/account/purchases');
    await expect(this.page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  }

  /** Jeu lié listé sur /account. */
  jeuLie(nom: string): Locator {
    return this.page.getByRole('main').first().getByText(nom).first();
  }

  /** Ligne d'achat (tableau ou liste) contenant le titre de l'article. */
  ligneAchat(titre: string): Locator {
    const main = this.page.getByRole('main').first();
    return main
      .getByRole('row')
      .or(main.getByRole('listitem'))
      .or(main.getByRole('article'))
      .filter({ hasText: titre })
      .first();
  }

  /**
   * Attend que l'achat affiche le statut voulu. La page d'historique n'a pas à se mettre à jour toute seule :
   * on la recharge jusqu'à obtenir le statut (la livraison elle-même est vérifiée côté jeu, sans rechargement).
   */
  async attendreStatut(titre: string, statut: RegExp, timeout = 30_000) {
    await expect(async () => {
      await this.ouvrirAchats();
      await expect(this.ligneAchat(titre)).toContainText(statut, { timeout: 2_000 });
    }).toPass({ timeout, intervals: [500, 1_000, 2_000] });
  }
}
