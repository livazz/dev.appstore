'use server';

import { headers } from 'next/headers';
import { clientIp } from '@/server/client-ip';
import { submitReport } from '@/server/reports';
import { getCurrentUser } from '@/server/session';

export interface ReportFormState {
  error?: string;
  /** Saisie conservée après une erreur. */
  values?: { category: string; explanation: string; itemId: string; email: string; goodFaith: boolean };
  /** Accusé de réception affiché après l'envoi. */
  done?: { reportId: string; receivedAt: string; email: string; gameName: string; itemTitle: string | null; ackSent: boolean };
}

const field = (fd: FormData, name: string, max = 4000) => {
  const v = fd.get(name);
  return typeof v === 'string' ? v.slice(0, max) : '';
};

/** Envoi d'un signalement (ouvert aux visiteurs non connectés). Tout est revérifié par `submitReport`. */
export async function submitReportAction(_prev: ReportFormState, fd: FormData): Promise<ReportFormState> {
  const values = {
    category: field(fd, 'category', 64),
    explanation: field(fd, 'explanation'),
    itemId: field(fd, 'itemId', 64),
    email: field(fd, 'email', 320),
    goodFaith: fd.get('goodFaith') === 'on',
  };
  // Piège à robots : champ invisible pour un humain. Réponse neutre, rien n'est enregistré.
  if (field(fd, 'website')) return { error: 'Votre signalement n’a pas pu être envoyé.', values };

  const user = await getCurrentUser();
  const r = await submitReport(
    field(fd, 'slug', 200),
    { category: values.category as never, explanation: values.explanation, itemId: values.itemId, email: values.email, goodFaith: values.goodFaith as true },
    { user, ip: clientIp(await headers()) },
  );
  if (!r.ok) return { error: r.message, values };
  return {
    done: { reportId: r.reportId, receivedAt: r.receivedAt.toISOString(), email: r.email, gameName: r.gameName, itemTitle: r.itemTitle, ackSent: r.ackSent },
  };
}
