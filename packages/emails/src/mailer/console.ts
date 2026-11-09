import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateMessage, type Mailer, type MailMessage, type SendResult } from './types';

export interface ConsoleMailerOptions {
  /** Dossier où écrire une copie HTML de chaque e-mail. Par défaut `.data/mails` (relatif au cwd). `false` pour désactiver. */
  dir?: string | false;
  /** Sortie console (remplaçable en test). */
  log?: (line: string) => void;
  /**
   * Mode production (défaut : `NODE_ENV === 'production'`). Revue 2026-11 (C-02) : les e-mails contiennent des liens à
   * jeton (vérification, réinitialisation du mot de passe) et des données personnelles. En production, seuls un
   * destinataire masqué et l'objet sont journalisés, jamais le corps, et aucune copie n'est écrite sur disque sauf
   * dossier passé explicitement (`dir` / `MAIL_CONSOLE_DIR`).
   */
  production?: boolean;
}

/** `jean.dupont@exemple.fr` → `j***@exemple.fr` (journaux de production). */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${address[0]}***${address.slice(at)}`;
}

function slug(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'mail';
}

/** Adaptateur de développement : affiche l'e-mail dans la console et l'écrit dans `.data/mails/*.html`. */
export function createConsoleMailer(options: ConsoleMailerOptions = {}): Mailer {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const dir = options.dir === false || (production && options.dir === undefined) ? null : resolve(options.dir ?? '.data/mails');
  const log = options.log ?? ((line: string) => console.info(line));
  let seq = 0;

  return {
    async send(message: MailMessage): Promise<SendResult> {
      validateMessage(message);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const id = `${stamp}-${String(++seq).padStart(3, '0')}-${slug(message.subject)}`;
      let file: string | undefined;
      if (dir) {
        await mkdir(dir, { recursive: true });
        file = join(dir, `${id}.html`);
        await writeFile(file, message.html, 'utf8');
        await writeFile(join(dir, `${id}.txt`), `À : ${message.to}\nObjet : ${message.subject}\n\n${message.text}`, 'utf8');
      }
      if (production) {
        log(`[mail] NON ENVOYÉ (transport console en production) — à ${maskEmail(message.to)}, objet « ${message.subject} »`);
        return { id };
      }
      log(
        [
          '┌─ [mail] ─────────────────────────────────────────',
          `│ À     : ${message.to}`,
          `│ Objet : ${message.subject}`,
          file ? `│ Aperçu: file://${file}` : undefined,
          '└──────────────────────────────────────────────────',
          message.text,
        ]
          .filter((l) => l !== undefined)
          .join('\n'),
      );
      return { id };
    },
  };
}
