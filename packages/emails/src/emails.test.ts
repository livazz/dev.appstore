import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@devappstore/core';
import {
  WITHDRAWAL_WAIVER_TEXT,
  computeWeeklyTotals,
  createConsoleMailer,
  createMailerFromEnv,
  createResendMailer,
  deliveryFailedEmail,
  escapeHtml,
  html,
  maskEmail,
  passwordResetEmail,
  passwordChangedEmail,
  existingAccountEmail,
  purchaseReceiptEmail,
  safeUrl,
  sendEmail,
  studioDeliveryAlertEmail,
  studioWeeklyReportEmail,
  trusted,
  verifyEmailEmail,
  withdrawalAcknowledgementEmail,
} from './index';
import * as f from './fixtures';
import { renderAllSamples } from './preview';

const XSS = `<script>alert("x")</script><img src=x onerror='y'>`;

describe('échappement', () => {
  it('escapeHtml échappe les caractères dangereux', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&\``)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&#96;');
  });

  it('html`` échappe les interpolations mais pas les fragments sûrs', () => {
    const inner = html`<b>${'<i>'}</b>`;
    expect(html`<p>${inner}${XSS}${['<', trusted('<br>')]}</p>`.value).toBe(
      '<p><b>&lt;i&gt;</b>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&lt;img src=x onerror=&#39;y&#39;&gt;&lt;<br></p>',
    );
  });

  it('safeUrl refuse javascript:, data: et les URL relatives', () => {
    expect(safeUrl('https://devappstore.com/a?b=1&c=2')).toBe('https://devappstore.com/a?b=1&c=2');
    expect(() => safeUrl('javascript:alert(1)')).toThrow();
    expect(() => safeUrl('data:text/html,<script>')).toThrow();
    expect(() => safeUrl('/relative')).toThrow();
  });

  it('aucune donnée dynamique n’est injectée telle quelle dans les modèles', () => {
    const mails = [
      purchaseReceiptEmail({
        ...f.sampleReceipt,
        playerName: XSS,
        item: { name: XSS, description: XSS },
        gameName: XSS,
        gameAccount: { playerId: XSS, playerName: XSS },
        seller: { name: XSS, address: XSS },
        orderId: XSS,
        consent: { ...f.sampleReceipt.consent, cgvVersion: XSS, waiverText: XSS },
      }),
      deliveryFailedEmail({ ...f.sampleDeliveryFailed, reason: XSS, gameName: XSS }),
      studioDeliveryAlertEmail({
        ...f.sampleDeliveryAlert,
        studioName: XSS,
        gameName: XSS,
        webhookUrl: XSS,
        failures: [{ ...f.sampleDeliveryAlert.failures[0]!, lastError: XSS, itemName: XSS, playerId: XSS }],
      }),
      studioWeeklyReportEmail({ ...f.sampleWeeklyReport, studioName: XSS, games: [{ name: XSS, revenueCents: 100, orders: 1 }] }),
      withdrawalAcknowledgementEmail({ ...f.sampleWithdrawal, playerName: XSS, orderId: XSS, item: { name: XSS }, gameName: XSS, sellerName: XSS, gameAccount: { playerId: XSS } }),
    ];
    for (const m of mails) {
      expect(m.html).not.toContain('<script');
      expect(m.html).not.toContain('<img');
      expect(m.html).not.toMatch(/<[^>]*onerror/i);
      expect(m.html).toContain('&lt;script&gt;');
      expect(m.subject).not.toMatch(/[\r\n]/);
    }
  });

  it('un lien javascript: dans un modèle fait échouer le rendu', () => {
    expect(() => verifyEmailEmail({ url: 'javascript:alert(1)' })).toThrow();
    expect(() => passwordResetEmail({ url: 'javascript:alert(1)' })).toThrow();
    expect(() => passwordChangedEmail({ resetUrl: 'javascript:alert(1)' })).toThrow();
    expect(() => existingAccountEmail({ loginUrl: 'https://ok.test/login', resetUrl: 'javascript:alert(1)' })).toThrow();
  });

  it('A-04 / A-07 : « mot de passe modifié » et « vous avez déjà un compte »', () => {
    const changed = passwordChangedEmail({ name: 'Léa', resetUrl: 'https://devappstore.test/forgot-password' });
    expect(changed.subject).toBe('Votre mot de passe Dev AppStore a été modifié');
    expect(changed.text).toContain('déconnecté de tous vos appareils');
    const existing = existingAccountEmail({ loginUrl: 'https://devappstore.test/login', resetUrl: 'https://devappstore.test/forgot-password' });
    expect(existing.subject).toBe('Vous avez déjà un compte Dev AppStore');
    expect(existing.text).toContain('https://devappstore.test/forgot-password');
    expect(existing.html).toContain('href="https://devappstore.test/login"');
  });

  it('les retours à la ligne sont retirés de l’objet (injection d’en-tête)', () => {
    const m = purchaseReceiptEmail({ ...f.sampleReceipt, gameName: 'Jeu\r\nBcc: victime@ex.fr' });
    expect(m.subject).not.toMatch(/[\r\n]/);
  });
});

describe('reçu d’achat — contenu légal (art. L221-28 13°)', () => {
  const m = purchaseReceiptEmail(f.sampleReceipt, f.sampleContext);

  it('reprend la demande de livraison immédiate et la renonciation, en HTML et en texte', () => {
    for (const body of [m.html, m.text]) {
      expect(body).toContain('L221-28 13°');
      expect(body).toContain('L221-13');
      expect(body).toContain('livraison immédiate');
      expect(body).toContain('perdre votre droit de rétractation');
      expect(body).toContain('support durable');
    }
    expect(m.text).toContain(WITHDRAWAL_WAIVER_TEXT);
    expect(m.html).toContain(escapeHtml(WITHDRAWAL_WAIVER_TEXT));
  });

  it('mentionne la version des CGV, leur lien et l’horodatage', () => {
    expect(m.text).toContain('CGV version 2026-11-09');
    expect(m.html).toContain('href="http://localhost:3000/legal/cgv/2026-11-09.pdf"');
    expect(m.text).toContain('2026-11-09T13:31:58.412Z');
    // Heure de Paris (UTC+1 en novembre).
    expect(m.text).toContain('9 novembre 2026 à 14:31:58');
  });

  it('indique article, prix TTC formaté par formatMoney, vendeur, commande et compte destinataire', () => {
    expect(m.text).toContain(formatMoney(499, 'EUR'));
    expect(m.text).toContain('TTC');
    expect(m.text).toContain('Nova Games SAS');
    expect(m.text).toContain('ord_7Hq2kD9x');
    expect(m.text).toContain('LeaDragon (ID PLR-48213)');
    expect(m.text).toContain('500 gemmes');
  });

  it('rappelle la rétractation possible tant que l’achat n’est pas livré, la garantie et le support', () => {
    expect(m.text).toContain('Me rétracter');
    expect(m.text).toContain('L224-25-1');
    expect(m.text).toContain('support');
    expect(m.text).toContain('Médiateur de la consommation');
  });

  it('respecte les contraintes mail : 600 px, tables, logo D jaune, pas de <style> ni de script', () => {
    expect(m.html).toContain('width="600"');
    expect(m.html).toContain('role="presentation"');
    expect(m.html).toMatch(/#ffd43b[^>]*>D<\/td>/);
    expect(m.html).not.toContain('<style');
    expect(m.html).not.toContain('<script');
    expect(m.html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('respecte une variante du texte de la case réellement affichée', () => {
    const v = purchaseReceiptEmail({ ...f.sampleReceipt, consent: { ...f.sampleReceipt.consent, waiverText: 'Texte affiché v2' } });
    expect(v.text).toContain('« Texte affiché v2 »');
  });
});

describe('accusé de réception de rétractation (directive 2023/2673)', () => {
  const m = withdrawalAcknowledgementEmail(f.sampleWithdrawal, f.sampleContext);

  it('reprend commande, article, montant remboursé, date de la demande et délai de remboursement', () => {
    for (const body of [m.text, m.html]) {
      expect(body).toContain('ord_7Hq2kD9x');
      expect(body).toContain('500 gemmes');
      expect(body).toContain('Crystal Clash');
      expect(body).toContain(escapeHtml(formatMoney(499, 'EUR')));
      // Demande le 9 novembre à 16:10:42 (heure de Paris) ; remboursement au plus tard 14 jours après.
      expect(body).toContain('9 novembre 2026 à 16:10:42');
      expect(body).toContain('23 novembre 2026');
      expect(body).toContain('14 jours');
      expect(body).toContain('support durable');
      expect(body).toContain('L221-21');
      expect(body).toContain('L221-24');
    }
    expect(m.text).toContain('Montant remboursé (TTC)');
    expect(m.text).toContain('2026-11-09T15:10:42.120Z');
    expect(m.subject).toContain('rétractation');
    expect(m.subject).toContain('500 gemmes');
  });

  it('à la marque Dev AppStore, logo carré jaune « D »', () => {
    expect(m.html).toMatch(/#ffd43b[^>]*>D<\/td>/);
    expect(m.html).toContain('>Dev AppStore</td>');
    expect(m.text.startsWith('Dev AppStore')).toBe(true);
    expect(m.text).toContain('Dev AppStore');
    expect(m.html).toContain('width="600"');
    expect(m.html).not.toContain('<style');
  });

  it('délai borné à 14 jours ; mention du mode simulation', () => {
    const long = withdrawalAcknowledgementEmail({ ...f.sampleWithdrawal, refundDays: 30 });
    expect(long.text).toContain('sous 14 jours');
    const short = withdrawalAcknowledgementEmail({ ...f.sampleWithdrawal, refundDays: 5 });
    expect(short.text).toContain('14 novembre 2026');
    const sim = withdrawalAcknowledgementEmail({ ...f.sampleWithdrawal, simulated: true });
    expect(sim.text).toContain('simulé');
  });
});

describe('modèles', () => {
  it('tous les modèles se rendent avec sujet, html et texte', () => {
    const all = renderAllSamples();
    expect(Object.keys(all)).toHaveLength(12);
    for (const [name, m] of Object.entries(all)) {
      expect(m.subject, name).toBeTruthy();
      expect(m.html, name).toContain('</html>');
      expect(m.text.length, name).toBeGreaterThan(50);
      expect(m.text, name).not.toMatch(/<\/?(p|td|tr|table|a|strong)\b/);
    }
  });

  it('rapport hebdo : économie vs stores calculée par le cœur', () => {
    const t = computeWeeklyTotals([{ name: 'A', revenueCents: 10_000, orders: 3, platformFeeBps: 500 }]);
    expect(t).toMatchObject({ revenueCents: 10_000, platformFeeCents: 500, netCents: 9_500, storeNetCents: 7_000, savingsCents: 2_500 });
    const m = studioWeeklyReportEmail({ ...f.sampleWeeklyReport, games: [{ name: 'A', revenueCents: 10_000, orders: 3 }] });
    expect(m.text).toContain(formatMoney(2_500));
    expect(m.text).toContain(formatMoney(7_000));
  });

  it('alerte studio : limite la liste et annonce le reste', () => {
    const failures = Array.from({ length: 12 }, (_, i) => ({ ...f.sampleDeliveryAlert.failures[0]!, deliveryId: `d${i}`, orderId: `ord_${i}` }));
    const m = studioDeliveryAlertEmail({ ...f.sampleDeliveryAlert, failures, totalFailed: 12 });
    expect(m.subject).toContain('12 livraisons en échec');
    expect(m.text).toContain('ord_9');
    expect(m.text).not.toContain('ord_10');
    expect(m.text).toContain('2 autres livraisons');
  });
});

describe('mailer', () => {
  it('console : écrit le HTML dans le dossier et logue', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'devappstore-mails-'));
    const log = vi.fn();
    try {
      const mailer = createConsoleMailer({ dir, log });
      const res = await sendEmail(mailer, 'joueur@devappstore.test', verifyEmailEmail(f.sampleVerify));
      const files = await readdir(dir);
      expect(files.some((n) => n === `${res.id}.html`)).toBe(true);
      expect(await readFile(join(dir, `${res.id}.html`), 'utf8')).toContain('Confirmer mon adresse');
      expect(log.mock.calls[0]![0]).toContain('joueur@devappstore.test');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('C-02 (revue 2026-11) : console en production → ni lien à jeton ni corps dans les journaux, aucune copie sur disque', async () => {
    const cwd = process.cwd();
    const tmp = await mkdtemp(join(tmpdir(), 'devappstore-mails-prod-'));
    const log = vi.fn();
    try {
      process.chdir(tmp);
      const mailer = createConsoleMailer({ log, production: true });
      const token = 'jeton-secret-reinit-0123456789';
      await sendEmail(mailer, 'owner@studio.test', passwordResetEmail({ url: `https://devappstore.test/reset-password/${token}` }));
      const out = log.mock.calls.map((c) => String(c[0])).join('\n');
      expect(out).not.toContain(token);
      expect(out).not.toContain('owner@studio.test');
      expect(out).toContain('o***@studio.test');
      expect(out).toContain('NON ENVOYÉ');
      expect(await readdir(tmp)).toEqual([]); // pas de .data/mails
    } finally {
      process.chdir(cwd);
      await rm(tmp, { recursive: true, force: true });
    }
    expect(maskEmail('jean.dupont@exemple.fr')).toBe('j***@exemple.fr');
  });

  it('C-02 : createMailerFromEnv propage NODE_ENV=production au transport console', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const mailer = createMailerFromEnv({ NODE_ENV: 'production', MAIL_TRANSPORT: 'console', MAIL_CONSOLE_DIR: undefined });
      await sendEmail(mailer, 'a@b.fr', passwordResetEmail({ url: 'https://devappstore.test/reset-password/tok_abc123' }));
      expect(log.mock.calls.map((c) => String(c[0])).join('')).not.toContain('tok_abc123');
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
  });

  it('refuse les destinataires invalides ou avec injection', async () => {
    const mailer = createConsoleMailer({ dir: false, log: () => {} });
    const c = verifyEmailEmail(f.sampleVerify);
    await expect(sendEmail(mailer, 'a@b.fr\r\nBcc: x@y.fr', c)).rejects.toThrow();
    await expect(sendEmail(mailer, 'a@b.fr, c@d.fr', c)).rejects.toThrow();
    await expect(sendEmail(mailer, 'pas-une-adresse', c)).rejects.toThrow();
  });

  it('resend : POST JSON avec la clé en Bearer', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 're_123' }), { status: 200 }));
    const mailer = createResendMailer({ apiKey: 're_key', from: 'Dev AppStore <no-reply@devappstore.com>', replyTo: 'support@devappstore.com', fetch: fetchMock as unknown as typeof fetch });
    const res = await mailer.send({ to: 'a@b.fr', subject: 'S', html: '<p>h</p>', text: 't' });
    expect(res.id).toBe('re_123');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Dev AppStore <no-reply@devappstore.com>',
      to: ['a@b.fr'],
      subject: 'S',
      html: '<p>h</p>',
      text: 't',
      reply_to: 'support@devappstore.com',
    });
  });

  it('resend : erreur explicite sans fuite de la clé', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: 'domain not verified' }), { status: 403 }));
    const mailer = createResendMailer({ apiKey: 're_secret', from: 'no-reply@devappstore.com', fetch: fetchMock as unknown as typeof fetch });
    const err = await mailer.send({ to: 'a@b.fr', subject: 'S', html: 'h', text: 't' }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('403');
    expect((err as Error).message).not.toContain('re_secret');
  });

  it('sélection par variables d’environnement', () => {
    expect(() => createMailerFromEnv({ MAIL_TRANSPORT: 'resend' })).toThrow(/RESEND_API_KEY/);
    expect(() => createMailerFromEnv({ MAIL_TRANSPORT: 'smtp' })).toThrow(/inconnu/);
    expect(createMailerFromEnv({ RESEND_API_KEY: 're_x' })).toBeDefined();
    expect(createMailerFromEnv({})).toBeDefined();
  });
});
