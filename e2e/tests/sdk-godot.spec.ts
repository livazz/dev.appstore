/*
 * Plugin Godot dans le VRAI moteur, de bout en bout (facultatif : ignoré sans GODOT_BIN).
 *
 *   GODOT_BIN=/Applications/Godot.app/Contents/MacOS/Godot npx playwright test sdk-godot --trace off
 *
 * Le test crée un projet Godot vide, y copie addons/devappstore (le contenu de l'archive téléchargeable), active le
 * plugin dans l'éditeur lancé sans interface (sdks/godot/tests/das_enabler joue le clic dans Projet > Paramètres du
 * projet > Plugins), relance l'éditeur pour vérifier que les réglages y sont toujours, écrit la clé publique dans les
 * réglages du projet, puis lance un jeu dont la scène contient le bouton link_button.tscn et un script connecté à
 * item_granted (sdks/godot/tests/smoke.tscn et smoke_probe.gd). Le nom du projet change à chaque essai : Godot lui donne
 * un dossier user:// neuf, donc un appareil jamais lié. Côté web, il joue le joueur : saisie du code affiché
 * par le jeu, confirmation, achat simulé. L'objet doit arriver dans Godot et le jeu se fermer avec le code 0.
 */
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { COMPTES, JEUX, demoKeys } from '../support/demo-data';
import { BASE_URL, REPO_ROOT } from '../support/env';
import { exigeRoutes, expect, test } from '../support/fixtures';

const GODOT = process.env.GODOT_BIN;
const SDK = path.join(REPO_ROOT, 'sdks/godot');
const ARTICLE = { titre: 'Sachet de graines', productId: 'seeds_50', quantite: 50 };
const REGLAGES = ['api/base_url', 'api/publishable_key', 'delivery/poll_interval_sec', 'delivery/poll_on_focus', 'delivery/auto_ack', 'player/use_device_id'];

test.describe('Plugin Godot — bouton glisser-déposer dans le moteur', () => {
  test.skip(!GODOT, 'GODOT_BIN non défini : essai dans le moteur ignoré');
  exigeRoutes('/login', '/games/[slug]/link', 'POST /api/v1/link-codes');
  test.setTimeout(8 * 60_000);

  test('plugin activé dans l’éditeur, code affiché par le jeu, achat sur le site, objet reçu dans Godot', async ({ page, connexion, liaison, pageJeu, paiement }) => {
    const work = mkdtempSync(path.join(tmpdir(), 'devappstore-godot-'));
    const project = path.join(work, 'project');
    const out = path.join(work, 'out');
    const read = (name: string) => (existsSync(path.join(out, name)) ? readFileSync(path.join(out, name), 'utf8').trim() : '');
    const editor = (n: number) => {
      execFileSync(GODOT!, ['--headless', '--editor', '--path', project, '--log-file', path.join(work, `editor-${n}.log`)], { timeout: 3 * 60_000, stdio: 'ignore' });
      return readFileSync(path.join(project, 'editor-report.txt'), 'utf8');
    };

    await test.step('projet Godot vierge, dossier addons glissé à la racine', async () => {
      mkdirSync(path.join(project, 'addons'), { recursive: true });
      cpSync(path.join(SDK, 'addons/devappstore'), path.join(project, 'addons/devappstore'), { recursive: true });
      cpSync(path.join(SDK, 'tests/das_enabler'), path.join(project, 'addons/das_enabler'), { recursive: true });
      cpSync(path.join(SDK, 'tests/smoke.tscn'), path.join(project, 'smoke.tscn'));
      cpSync(path.join(SDK, 'tests/smoke_probe.gd'), path.join(project, 'smoke_probe.gd'));
      writeFileSync(
        path.join(project, 'project.godot'),
        ['config_version=5', '', '[application]', '', `config/name="DevAppStore Smoke ${path.basename(work)}"`, 'run/main_scene="res://smoke.tscn"', '', '[editor_plugins]', '', 'enabled=PackedStringArray("res://addons/das_enabler/plugin.cfg")', ''].join('\n'),
      );
    });

    await test.step('activation du plugin : autoload et réglages enregistrés', async () => {
      const report = editor(1);
      expect(report).toContain('was_enabled=false');
      expect(report).toContain('enabled=true');
      expect(report).toMatch(/^autoload=\*\S+/m);
      for (const key of REGLAGES) expect(report).toContain(`devappstore/${key} has=true listed=true`);
      const cfg = readFileSync(path.join(project, 'project.godot'), 'utf8');
      expect(cfg).toMatch(/\[autoload\]\s+DevAppStore="\*/);
      expect(cfg).toContain('res://addons/devappstore/plugin.cfg');
    });

    await test.step('après un redémarrage de l’éditeur, les réglages sont toujours proposés', async () => {
      const report = editor(2);
      expect(report).toContain('was_enabled=true');
      for (const key of REGLAGES) expect(report).toContain(`devappstore/${key} has=true listed=true`);
    });

    await test.step('clé publique collée dans les réglages du projet', async () => {
      appendFileSync(
        path.join(project, 'project.godot'),
        ['', '[devappstore]', '', `api/base_url="${BASE_URL}"`, `api/publishable_key="${demoKeys().farm.publishableKey!}"`, 'delivery/poll_interval_sec=3.0', ''].join('\n'),
      );
    });

    const log = path.join(work, 'game.log');
    const godot = spawn(GODOT!, ['--headless', '--path', project, '--log-file', log, '--', out], { stdio: 'ignore' });
    const exited = new Promise<number | null>((resolve) => godot.on('exit', resolve));

    try {
      let code = '';
      await test.step('le jeu affiche un code de liaison', async () => {
        await expect.poll(() => read('code.txt'), { timeout: 60_000, message: `aucun code : voir ${log} et ${path.join(out, 'errors.txt')}` }).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
        code = read('code.txt');
      });

      await test.step('le joueur saisit le code sur le site et confirme', async () => {
        await connexion.seConnecter(COMPTES.joueur);
        await liaison.ouvrir(JEUX.farm.slug, { changer: true });
        await liaison.saisirCode(code);
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

      await test.step('Godot reçoit l’objet, l’acquitte et se ferme', async () => {
        await expect.poll(() => read('granted.txt'), { timeout: 60_000, message: `achat non reçu : voir ${path.join(out, 'errors.txt')}` }).toBe(`${ARTICLE.productId} ${ARTICLE.quantite}`);
        expect(await exited).toBe(0);
        expect(read('result.txt')).toBe('OK');
        expect(read('errors.txt')).toBe('');
        expect(readFileSync(log, 'utf8')).not.toMatch(/SCRIPT ERROR|Parse Error/);
        await paiement.attendreLivre();
      });
    } finally {
      godot.kill();
    }
  });
});
