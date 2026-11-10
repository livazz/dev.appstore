/*
 * Lecture des e-mails du serveur de test (transport console → e2e/.data/mails/*.txt, cf. MAILS_DIR).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { MAILS_DIR } from './env';

export interface MailLu {
  to: string;
  subject: string;
  text: string;
}

function lireTous(): MailLu[] {
  if (!existsSync(MAILS_DIR)) return [];
  return readdirSync(MAILS_DIR)
    .filter((f) => f.endsWith('.txt'))
    .sort()
    .map((f) => {
      const raw = readFileSync(join(MAILS_DIR, f), 'utf8');
      const [header, ...body] = raw.split('\n\n');
      const to = /^À : (.*)$/m.exec(header ?? '')?.[1]?.trim() ?? '';
      const subject = /^Objet : (.*)$/m.exec(header ?? '')?.[1]?.trim() ?? '';
      return { to, subject, text: body.join('\n\n') };
    });
}

/** Attend le dernier e-mail adressé à `to` dont l'objet correspond, et renvoie son premier lien à jeton. */
export async function attendreLien(to: string, objet: RegExp): Promise<string> {
  let lien = '';
  await expect
    .poll(
      () => {
        const mail = lireTous().reverse().find((m) => m.to === to && objet.test(m.subject));
        lien = mail?.text.match(/https?:\/\/\S+?token=[^\s)]+/)?.[0] ?? '';
        return lien;
      },
      { message: `e-mail « ${objet} » pour ${to}`, timeout: 20_000 },
    )
    .not.toBe('');
  return lien;
}
