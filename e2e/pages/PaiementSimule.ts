import { expect, type Locator, type Page } from '@playwright/test';

/** `/checkout/mock` (paiement simulé, STRIPE_SECRET_KEY vide) puis `/checkout/success` (tâche « payments »). */
export class PaiementSimule {
  readonly bandeauDemo: Locator;
  readonly boutonPayer: Locator;
  /**
   * Case « livraison immédiate / renonciation au droit de rétractation » (docs/legal/consumer.md § 2.3).
   * Facultative tant que le module ne l'a pas ajoutée : on la coche si elle est là.
   */
  readonly consentement: Locator;

  constructor(readonly page: Page) {
    this.bandeauDemo = page.getByRole('note').filter({ hasText: /mode démo/i });
    this.boutonPayer = page.getByRole('button', { name: /^payer/i });
    this.consentement = page.getByRole('checkbox', { name: /livraison immédiate|rétractation/i });
  }

  async attendre() {
    await expect(this.page).toHaveURL(/\/checkout\/mock/);
    await expect(this.page.getByRole('heading', { level: 1, name: /paiement/i })).toBeVisible();
    await expect(this.bandeauDemo).toBeVisible();
  }

  /** Coche le consentement s'il existe, clique « Payer x,xx € » et attend la page de confirmation. */
  async payer() {
    if (await this.consentement.count()) await this.consentement.check();
    await expect(this.boutonPayer).toBeEnabled();
    await this.boutonPayer.click();
    await expect(this.page).toHaveURL(/\/checkout\/success/);
  }

  /** La page de confirmation passe d'elle-même (sans rechargement manuel) à « Livré dans le jeu ». */
  async attendreLivre(timeout = 30_000) {
    await expect(this.page.getByRole('heading', { level: 1, name: /livré/i })).toBeVisible({ timeout });
  }
}
