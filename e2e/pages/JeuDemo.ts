import { expect, type Locator, type Page } from '@playwright/test';
import { DEMO_GAME_URL } from '../support/env';
import type { DemoGameKey } from '../support/demo-data';

/** Page du faux jeu (apps/demo-game, http://localhost:4100) : inventaire et journal des achats reçus. */
export class JeuDemo {
  readonly choixJoueur: Locator;
  readonly journal: Locator;

  constructor(readonly page: Page) {
    this.choixJoueur = page.getByLabel(/joueur courant/i);
    this.journal = page.getByRole('list').filter({ hasText: /achat|webhook|code/i }).first();
  }

  /** Ouvre le jeu pour un joueur (paramètres `game` et `player` lus par la page). */
  async ouvrir(game: DemoGameKey, playerId: string) {
    await this.page.goto(`${DEMO_GAME_URL}/?${new URLSearchParams({ game, player: playerId })}`);
    await expect(this.choixJoueur).toHaveValue(playerId);
  }

  /** L'achat apparaît dans le jeu sans rechargement (webhook serveur ou SDK). */
  async attendreAchat(libelleProduit: string, timeout = 30_000) {
    const recu = this.page
      .getByText(`Webhook reçu : ${libelleProduit}`, { exact: false })
      .or(this.page.getByText(`SDK : ${libelleProduit} reçu`, { exact: false }))
      .first();
    await expect(recu).toBeVisible({ timeout });
  }
}
