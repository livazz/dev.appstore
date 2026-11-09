import { expect, type Locator, type Page } from '@playwright/test';
import { contient } from '../support/text';

export interface NouvelArticle {
  titre: string;
  /** Palier de prix en centimes (PRICE_TIERS_CENTS de @wolleen/core), ex. 199. */
  prixCents?: number;
  sousTitre?: string;
  /** Identifiant produit envoyé au jeu ; par défaut celui suggéré depuis le titre. */
  productId?: string;
}

/** `/studio` (mes jeux) et `/studio/games/[id]` — éditeur de boutique (tâche « studio-editor »). */
export class StudioEditeur {
  readonly boutonAjouterArticle: Locator;
  /** Modale de création d'article (role="dialog", « Nouvel article »). */
  readonly modaleArticle: Locator;
  readonly enregistre: Locator;

  constructor(readonly page: Page) {
    this.boutonAjouterArticle = page.getByRole('button', { name: /^ajouter un article$/i });
    this.modaleArticle = page.getByRole('dialog', { name: /nouvel article/i });
    this.enregistre = page.getByText(/modifications enregistrées/i);
  }

  async ouvrirAccueil() {
    await this.page.goto('/studio');
    await expect(this.page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  }

  /** Tuile d'un jeu sur /studio. */
  lienJeu(nom: string): Locator {
    return this.page.getByRole('main').first().getByRole('link', { name: contient(nom) }).first();
  }

  /** Depuis /studio, ouvre l'éditeur du jeu. */
  async ouvrirJeu(nom: string) {
    await this.lienJeu(nom).click();
    await this.attendreEditeur(nom);
  }

  async ouvrir(gameId: string, nom?: string) {
    await this.page.goto(`/studio/games/${encodeURIComponent(gameId)}`);
    await this.attendreEditeur(nom);
  }

  async attendreEditeur(nom?: string) {
    await expect(this.page).toHaveURL(/\/studio\/games\/[^/?]+(\?|$)/);
    if (nom) await expect(this.page.getByRole('heading', { level: 1, name: contient(nom) })).toBeVisible();
    await expect(this.boutonAjouterArticle).toBeVisible();
  }

  /** Carte d'article dans l'aperçu de l'éditeur (ItemCard : nom accessible = titre). */
  carteArticle(titre: string): Locator {
    return this.page.getByRole('button', { name: titre, exact: true }).first();
  }

  /** « Ajouter un article » → onglet Infos → Suivant → onglet Mise en page → Ajouter. */
  async ajouterArticle(a: NouvelArticle) {
    await this.boutonAjouterArticle.click();
    const m = this.modaleArticle;
    await expect(m).toBeVisible();
    await m.getByLabel(/titre de l.article/i).fill(a.titre);
    if (a.sousTitre) await m.getByLabel(/sous-titre/i).fill(a.sousTitre);
    if (a.prixCents !== undefined) await m.getByLabel(/^prix/i).selectOption(String(a.prixCents));
    if (a.productId) await m.getByLabel(/identifiant produit/i).fill(a.productId);
    await m.getByRole('button', { name: /^suivant$/i }).click();
    await m.getByRole('button', { name: /^ajouter$/i }).click();
    await expect(m).toBeHidden();
    await expect(this.carteArticle(a.titre)).toBeVisible();
  }
}
