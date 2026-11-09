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

  /** Ouvre le détail de l'article (si besoin) puis clique sur « Payer » (après la case de renonciation) / « Lier mon compte et acheter ». */
  /** Ouvre le détail de l'article puis va à la liaison : « Lier mon compte et acheter », ou « Changer » si un compte est déjà lié. */
  async allerALaLiaison(titre: string) {
    const detail = await this.ouvrirDetail(titre);
    const lier = detail.getByRole('button', { name: /lier mon compte/i });
    const changer = detail.getByRole('link', { name: /changer/i });
    await expect(lier.or(changer).first()).toBeVisible({ timeout: 15_000 });
    if (await changer.isVisible()) await changer.click();
    else await lier.click();
  }

  async ouvrirDetail(titre: string) {
    const detail = this.detail(titre);
    if (!(await detail.isVisible())) {
      await expect(this.carteArticle(titre)).toBeVisible();
      await expect(async () => {
        if (!(await detail.isVisible())) await this.carteArticle(titre).click();
        await expect(detail).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
    }
    return detail;
  }

  async acheter(titre: string) {
    const detail = this.detail(titre);
    if (!(await detail.isVisible())) {
      await expect(this.carteArticle(titre)).toBeVisible();
      // En `next dev`, un clic peut précéder l'hydratation : on réessaie jusqu'à l'ouverture du détail.
      await expect(async () => {
        if (!(await detail.isVisible())) await this.carteArticle(titre).click();
        await expect(detail).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
    }
    const bouton = detail.getByRole('button', { name: /acheter|payer/i });
    await expect(bouton).toBeEnabled();
    // Compte lié : case obligatoire « livraison immédiate / renonciation au droit de rétractation » avant « Payer ».
    const renonciation = detail.getByRole('checkbox', { name: /renonce à mon droit de rétractation/i });
    if (await renonciation.isVisible()) await renonciation.check();
    await bouton.click();
  }
}
