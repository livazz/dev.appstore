/**
 * Génère tous les modèles en HTML (+ texte) dans `.data/mails-preview/` à la racine du dépôt.
 * Usage : `npm run preview -w @wolleen/emails` [-- <dossier>]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from './escape';
import type { EmailContent } from './layout';
import * as f from './fixtures';
import { deliveryFailedEmail, playerWelcomeEmail, purchaseDeliveredEmail, purchaseReceiptEmail } from './templates/player';
import { passwordResetEmail, verifyEmailEmail } from './templates/auth';
import { studioDeliveryAlertEmail, studioWeeklyReportEmail, studioWelcomeEmail } from './templates/studio';

export function renderAllSamples(): Record<string, EmailContent> {
  const ctx = f.sampleContext;
  return {
    'recu-achat': purchaseReceiptEmail(f.sampleReceipt, ctx),
    'achat-livre': purchaseDeliveredEmail(f.sampleDelivered, ctx),
    'echec-livraison': deliveryFailedEmail(f.sampleDeliveryFailed, ctx),
    'bienvenue-joueur': playerWelcomeEmail(f.samplePlayerWelcome, ctx),
    'verification-email': verifyEmailEmail(f.sampleVerify, ctx),
    'reinitialisation-mot-de-passe': passwordResetEmail(f.sampleReset, ctx),
    'bienvenue-studio': studioWelcomeEmail(f.sampleStudioWelcome, ctx),
    'alerte-livraisons-studio': studioDeliveryAlertEmail(f.sampleDeliveryAlert, ctx),
    'rapport-hebdo-studio': studioWeeklyReportEmail(f.sampleWeeklyReport, ctx),
  };
}

async function main() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const outDir = resolve(process.argv[2] ?? join(repoRoot, '.data/mails-preview'));
  await mkdir(outDir, { recursive: true });
  const all = renderAllSamples();
  const links: string[] = [];
  for (const [name, mail] of Object.entries(all)) {
    await writeFile(join(outDir, `${name}.html`), mail.html, 'utf8');
    await writeFile(join(outDir, `${name}.txt`), `Objet : ${mail.subject}\n\n${mail.text}`, 'utf8');
    links.push(
      `<li style="margin:6px 0"><a href="${name}.html">${escapeHtml(name)}</a> — ${escapeHtml(mail.subject)} (<a href="${name}.txt">texte</a>)</li>`,
    );
  }
  await writeFile(
    join(outDir, 'index.html'),
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Aperçu des e-mails Wolleen</title></head><body style="font-family:system-ui,sans-serif;padding:24px"><h1>E-mails Wolleen</h1><ul>${links.join('')}</ul></body></html>`,
    'utf8',
  );
  console.info(`${Object.keys(all).length} modèles générés dans ${outDir} (ouvrir index.html)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
