import { expect, type Locator, type Page } from '@playwright/test';

/** `/games/[slug]/link` — liaison du compte de jeu (tâche « linking »). */
export class Liaison {
  /** Méthode `code` : section « Avec le code affiché dans le jeu ». */
  readonly sectionCode: Locator;
  readonly champCode: Locator;
  /** Méthode `id_confirm` : section « Avec votre identifiant joueur ». */
  readonly sectionId: Locator;
  readonly champIdentifiant: Locator;
  /** Message d'erreur annoncé (role="alert"). */
  readonly erreur: Locator;
  /** Carte « Compte lié » affichée quand le compte est déjà lié. */
  readonly compteLie: Locator;

  constructor(readonly page: Page) {
    this.sectionCode = page.getByRole('region', { name: /code affiché dans le jeu/i });
    this.champCode = this.sectionCode.getByLabel(/code de liaison/i);
    this.sectionId = page.getByRole('region', { name: /identifiant joueur/i });
    this.champIdentifiant = this.sectionId.getByLabel(/identifiant joueur/i);
    this.erreur = page.getByRole('main').first().getByRole('alert').filter({ hasText: /\S/ }).first();
    this.compteLie = page.getByRole('region', { name: /compte lié/i });
  }

  async ouvrir(slug: string, opts: { item?: string; changer?: boolean } = {}) {
    const qs = new URLSearchParams({ ...(opts.item ? { item: opts.item } : {}), ...(opts.changer ? { change: '1' } : {}) }).toString();
    await this.page.goto(`/games/${encodeURIComponent(slug)}/link${qs ? `?${qs}` : ''}`);
    await this.attendre();
  }

  async attendre() {
    await expect(this.page).toHaveURL(/\/games\/[^/]+\/link/);
    await expect(this.page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  }

  /** Saisit le code et valide. Ne vérifie pas le résultat (succès : redirection ; échec : `erreur`). */
  async saisirCode(code: string) {
    await this.champCode.fill(code);
    await this.sectionCode.getByRole('button', { name: /lier mon compte/i }).click();
  }

  /** Saisit le code et attend la redirection hors de /link (liaison réussie). */
  async lierParCode(code: string) {
    await this.saisirCode(code);
    await expect(this.page).not.toHaveURL(/\/link(\?|$)/);
  }

  /** Méthode id_confirm, étape 1 : recherche du joueur par son identifiant. */
  async rechercherJoueur(playerId: string) {
    await this.champIdentifiant.fill(playerId);
    await this.sectionId.getByRole('button', { name: /^rechercher$/i }).click();
  }

  /** Écran « Est-ce bien vous : <nom> ? ». */
  ecranConfirmation(): Locator {
    return this.sectionId.getByText(/est-ce bien vous/i);
  }

  /** Méthode id_confirm, étape 2 : « Oui, c'est moi ». */
  async confirmerJoueur() {
    await this.sectionId.getByRole('button', { name: /oui, c.est moi/i }).click();
    await expect(this.page).not.toHaveURL(/\/link(\?|$)/);
  }
}
