import { expect, type Locator, type Page } from '@playwright/test';

/** `/studio/games/[id]/integration` — clés API, webhook, journal, liaison (tâche « delivery »). */
export class Integration {
  readonly titre: Locator;
  readonly sectionCleApi: Locator;
  readonly sectionWebhook: Locator;
  readonly sectionJournal: Locator;
  readonly sectionLiaison: Locator;
  readonly boutonRegenererCle: Locator;
  readonly boutonTestWebhook: Locator;

  constructor(readonly page: Page) {
    const main = page.getByRole('main').first();
    this.titre = page.getByRole('heading', { level: 1, name: /intégration/i });
    this.sectionCleApi = main.getByRole('heading', { name: /^clé api$/i });
    this.sectionWebhook = main.getByRole('heading', { name: /^webhook$/i });
    this.sectionJournal = main.getByRole('heading', { name: /journal des livraisons/i });
    this.sectionLiaison = main.getByRole('heading', { name: /liaison des comptes/i });
    this.boutonRegenererCle = main.getByRole('button', { name: /régénérer/i }).first();
    this.boutonTestWebhook = main.getByRole('button', { name: /envoyer un événement de test/i });
  }

  async ouvrir(gameId: string) {
    await this.page.goto(`/studio/games/${encodeURIComponent(gameId)}/integration`);
    await expect(this.titre).toBeVisible();
  }

  /** Ligne du journal des livraisons contenant le texte donné (produit, ID de livraison…). */
  ligneJournal(texte: string | RegExp): Locator {
    return this.page.getByRole('main').first().getByRole('row').filter({ hasText: texte }).first();
  }
}
