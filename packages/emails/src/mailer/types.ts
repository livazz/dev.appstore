export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface SendResult {
  /** Identifiant renvoyé par le transport (id Resend, nom du fichier en console). */
  id: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<SendResult>;
}

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

/** Refuse les adresses invalides et toute tentative d'injection d'en-tête (CR/LF, listes). */
export function assertEmailAddress(value: string, field = 'to'): string {
  if (typeof value !== 'string' || value.length > 254 || /[\r\n]/.test(value) || !EMAIL_RE.test(value)) {
    throw new Error(`Adresse e-mail invalide (${field})`);
  }
  return value;
}

export function validateMessage(m: MailMessage): MailMessage {
  assertEmailAddress(m.to, 'to');
  if (m.replyTo) assertEmailAddress(m.replyTo, 'replyTo');
  if (!m.subject || /[\r\n]/.test(m.subject)) throw new Error('Objet d’e-mail invalide');
  if (!m.html || !m.text) throw new Error('Un e-mail doit avoir une version HTML et une version texte');
  return m;
}
