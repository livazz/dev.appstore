import { expect, type Locator, type Page } from '@playwright/test';

/** `/games/[slug]` — boutique publique d'un jeu (catalog : page ; payments : bouton Acheter). */
export class PageJeu {
  constructor(readonly page: Page) {}

  async ouvrir(slug: string) {
    await this.page.goto(`/games/${encodeURIComponent(slug)}`);
  }

  titre(nom: string): Locator {
    return this.page.getByRole('heading', { level: 1, name: nom });
  }

  /** Carte d'article de la boutique (ItemCard : bouton dont le nom accessible est le titre de l'article). */
  carteArticle(titre: string): Locator {
    return this.page.getByRole('button', { name: titre, exact: true });
  }

  /** Panneau de détail d'un article (role="dialog" nommé par le titre). */
  detail(titre: string): Locator {
    return this.page.getByRole('dialog', { name: titre });
  }

  /** Ouvre le détail de l'article (si besoin) puis clique sur « Acheter » / « Lier mon compte et acheter ». */
  async acheter(titre: string) {
    const detail = this.detail(titre);
    if (!(await detail.isVisible())) {
      await expect(this.carteArticle(titre)).toBeVisible();
      await this.carteArticle(titre).click();
    }
    await expect(detail).toBeVisible();
    const bouton = detail.getByRole('button', { name: /acheter/i });
    await expect(bouton).toBeEnabled();
    await bouton.click();
  }
}
