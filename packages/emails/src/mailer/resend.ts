import { assertEmailAddress, validateMessage, type Mailer, type MailMessage, type SendResult } from './types';

export interface ResendMailerOptions {
  apiKey: string;
  /** Expéditeur, ex. `Wolleen <no-reply@wolleen.com>` (domaine vérifié chez Resend). */
  from: string;
  /** Adresse de réponse par défaut (support). */
  replyTo?: string;
  endpoint?: string;
  /** Injection pour les tests ; par défaut le `fetch` global. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class MailerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MailerError';
  }
}

/** Adaptateur Resend (API HTTP, sans SDK). https://resend.com/docs/api-reference/emails/send-email */
export function createResendMailer(options: ResendMailerOptions): Mailer {
  if (!options.apiKey) throw new MailerError('RESEND_API_KEY manquante');
  const fromAddress = /<([^>]+)>/.exec(options.from)?.[1] ?? options.from;
  assertEmailAddress(fromAddress, 'from');
  if (/[\r\n]/.test(options.from)) throw new MailerError('Expéditeur invalide');
  const endpoint = options.endpoint ?? 'https://api.resend.com/emails';
  const doFetch = options.fetch ?? fetch;

  return {
    async send(message: MailMessage): Promise<SendResult> {
      validateMessage(message);
      const replyTo = message.replyTo ?? options.replyTo;
      const res = await doFetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
      const body = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
      if (!res.ok || !body?.id) {
        // Ne jamais inclure la clé ni le contenu du message dans l'erreur.
        throw new MailerError(`Resend a refusé l'envoi (${res.status}) : ${body?.message ?? body?.name ?? 'réponse invalide'}`, res.status);
      }
      return { id: body.id };
    },
  };
}
