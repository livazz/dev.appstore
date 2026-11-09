/*
 * Vérification du harnais lui-même : le serveur de test répond, sur la base isolée e2e/.data, migrée et seedée.
 * Toujours active (aucune dépendance aux modules de la vague 1).
 */
import { JEUX } from '../support/demo-data';
import { expect, test } from '../support/fixtures';

test('le site répond et affiche les jeux de démo seedés', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.getByText(JEUX.crystal.nom).first()).toBeVisible();
  await expect(page.getByText(JEUX.farm.nom).first()).toBeVisible();
});
