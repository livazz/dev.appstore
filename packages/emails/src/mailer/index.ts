import { createConsoleMailer } from './console';
import { createResendMailer } from './resend';
import type { Mailer, SendResult } from './types';
import type { EmailContent } from '../layout';

export * from './types';
export { createConsoleMailer, type ConsoleMailerOptions } from './console';
export { createResendMailer, MailerError, type ResendMailerOptions } from './resend';

export const DEFAULT_MAIL_FROM = 'Wolleen <no-reply@wolleen.com>';

/**
 * Sélection du transport par variables d'environnement :
 * - `MAIL_TRANSPORT=console|resend` (facultatif) ;
 * - à défaut : `resend` si `RESEND_API_KEY` est défini, sinon `console` ;
 * - `MAIL_FROM` (expéditeur), `MAIL_REPLY_TO` (réponse), `MAIL_CONSOLE_DIR` (dossier des copies, `.data/mails`).
 */
export function createMailerFromEnv(env: Record<string, string | undefined> = process.env): Mailer {
  const transport = (env.MAIL_TRANSPORT || (env.RESEND_API_KEY ? 'resend' : 'console')).toLowerCase();
  if (transport === 'resend') {
    if (!env.RESEND_API_KEY) throw new Error('MAIL_TRANSPORT=resend mais RESEND_API_KEY est vide');
    return createResendMailer({
      apiKey: env.RESEND_API_KEY,
      from: env.MAIL_FROM || DEFAULT_MAIL_FROM,
      replyTo: env.MAIL_REPLY_TO || undefined,
    });
  }
  if (transport === 'console') {
    if (env.NODE_ENV === 'production' && !env.MAIL_TRANSPORT) {
      console.warn('[mail] RESEND_API_KEY absente en production : les e-mails ne sont PAS envoyés (transport console).');
    }
    return createConsoleMailer({ dir: env.MAIL_CONSOLE_DIR || undefined });
  }
  throw new Error(`MAIL_TRANSPORT inconnu : ${transport} (attendu : console ou resend)`);
}

/** Raccourci : `sendEmail(mailer, 'joueur@ex.fr', purchaseReceiptEmail(data))`. */
export function sendEmail(mailer: Mailer, to: string, content: EmailContent, replyTo?: string): Promise<SendResult> {
  return mailer.send({ to, ...content, ...(replyTo ? { replyTo } : {}) });
}
