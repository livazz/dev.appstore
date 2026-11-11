/*
 * SDK Unity dans le VRAI moteur, de bout en bout (facultatif : ignoré sans UNITY_EDITOR).
 *
 *   UNITY_EDITOR=/Applications/Unity/Hub/Editor/<version>/Unity.app/Contents/MacOS/Unity \
 *     npx playwright test sdk-unity --trace off
 *
 * Le test crée un projet Unity vide, y référence le paquet sdks/unity, pose le prefab « DevAppStore » dans une scène,
 * branche « On Item Granted » comme le ferait un glisser-déposer dans l'inspecteur, puis lance le mode Play sans
 * interface (sdks/unity/Tests~/SdkTools.cs et SmokeProbe.cs). Côté web, il joue le joueur : saisie du code affiché par
 * le jeu, confirmation, achat simulé. L'objet doit arriver dans Unity et l'éditeur se fermer avec le code 0.
 *
 * UNITY_SMOKE_DIR=/dossier garde le projet d'un lancement à l'autre (premier import : environ une minute).
 */
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { COMPTES, JEUX, demoKeys } from '../support/demo-data';
import { BASE_URL, REPO_ROOT } from '../support/env';
import { exigeRoutes, expect, test } from '../support/fixtures';

const UNITY = process.env.UNITY_EDITOR;
const SDK = path.join(REPO_ROOT, 'sdks/unity');
const ARTICLE = { titre: 'Sachet de graines', productId: 'seeds_50', quantite: 50 };

test.describe('SDK Unity — prefab glisser-déposer dans le moteur', () => {
  test.skip(!UNITY, 'UNITY_EDITOR non défini : essai dans le moteur ignoré');
  exigeRoutes('/login', '/games/[slug]/link', 'POST /api/v1/link-codes');
  test.setTimeout(10 * 60_000);

  test('code de liaison affiché par le jeu, achat sur le site, objet reçu dans Unity', async ({ page, connexion, liaison, pageJeu, paiement }) => {
    const work = process.env.UNITY_SMOKE_DIR || mkdtempSync(path.join(tmpdir(), 'devappstore-unity-'));
    const project = path.join(work, 'project');
    const out = path.join(work, 'out');
    const read = (name: string) => (existsSync(path.join(out, name)) ? readFileSync(path.join(out, name), 'utf8').trim() : '');
    const log = (name: string) => path.join(work, `${name}.log`);

    await test.step('projet Unity de test (paquet local + outils)', async () => {
      const manifest = path.join(project, 'Packages/manifest.json');
      if (!existsSync(manifest)) {
        execFileSync(UNITY!, ['-batchmode', '-nographics', '-quit', '-createProject', project, '-logFile', log('create')], { timeout: 5 * 60_000 });
      }
      const m = JSON.parse(readFileSync(manifest, 'utf8')) as { dependencies: Record<string, string> };
      m.dependencies['com.devappstore.sdk'] = `file:${SDK}`;
      writeFileSync(manifest, JSON.stringify(m, null, 2));
      mkdirSync(path.join(project, 'Assets/Editor'), { recursive: true });
      cpSync(path.join(SDK, 'Tests~/SdkTools.cs'), path.join(project, 'Assets/Editor/SdkTools.cs'));
      cpSync(path.join(SDK, 'Tests~/SmokeProbe.cs'), path.join(project, 'Assets/SmokeProbe.cs'));
      rmSync(out, { recursive: true, force: true });
    });

    const unity = spawn(
      UNITY!,
      ['-batchmode', '-nographics', '-projectPath', project, '-executeMethod', 'SdkTools.RunSmoke', '-smokeKey', demoKeys().farm.publishableKey!, '-smokeUrl', BASE_URL, '-smokeOut', out, '-logFile', log('smoke')],
      { stdio: 'ignore' },
    );
    const exited = new Promise<number | null>((resolve) => unity.on('exit', resolve));

    try {
      let code = '';
      await test.step('le jeu affiche un code de liaison', async () => {
        await expect.poll(() => read('code.txt'), { timeout: 5 * 60_000, message: `aucun code : voir ${log('smoke')} et ${path.join(out, 'errors.txt')}` }).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
        code = read('code.txt');
      });

      await test.step('le joueur saisit le code sur le site et confirme', async () => {
        await connexion.seConnecter(COMPTES.joueur);
        await liaison.ouvrir(JEUX.farm.slug, { changer: true });
        await liaison.saisirCode(code);
        // Code demandé avec la clé publique : confirmation explicite du joueur.
        await liaison.sectionCode.getByRole('button', { name: /oui, c.est mon compte de jeu/i }).click();
        await expect(page).not.toHaveURL(/\/link(\?|$)/);
        await expect.poll(() => read('linked.txt'), { timeout: 30_000, message: 'le jeu n’a pas reçu son jeton joueur' }).toBe('1');
      });

      await test.step(`achat de « ${ARTICLE.titre} » (paiement simulé)`, async () => {
        await pageJeu.ouvrir(JEUX.farm.slug);
        await pageJeu.acheter(ARTICLE.titre);
        await paiement.attendre();
        await paiement.payer();
      });

      await test.step('Unity reçoit l’objet, l’acquitte et se ferme', async () => {
        await expect.poll(() => read('granted.txt'), { timeout: 60_000, message: `achat non reçu : voir ${path.join(out, 'errors.txt')}` }).toBe(`${ARTICLE.productId} ${ARTICLE.quantite}`);
        expect(await exited).toBe(0);
        expect(read('result.txt')).toBe('OK');
        expect(read('errors.txt')).toBe('');
        await paiement.attendreLivre();
      });
    } finally {
      unity.kill();
    }
  });
});
