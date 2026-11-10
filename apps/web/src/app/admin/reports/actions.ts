'use server';

import { revalidatePath } from 'next/cache';
import { AdminError } from '@/server/admin';
import { dismissReports } from '@/server/reports';
import type { AdminActionState } from '@/components/admin/action-state';

/*
 * Server Action « Classer sans suite ». `dismissReports` vérifie l'accès (404 sinon), clôt les signalements et
 * journalise dans la même transaction, puis informe les signalants.
 */

function field(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === 'string' ? v : '';
}

export async function dismissReportsAction(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  const gameId = field(form, 'gameId');
  const reportIds = field(form, 'reportIds').split(',').map((s) => s.trim()).filter(Boolean);
  try {
    const r = await dismissReports(gameId, { reason: field(form, 'reason'), reportIds });
    revalidatePath('/admin/reports');
    revalidatePath('/admin');
    const plural = r.closed > 1 ? 's' : '';
    return {
      ok: true,
      message:
        `${r.closed} signalement${plural} classé${plural} sans suite. ${r.notified}/${r.closed} signalant${plural} informé${plural} par e-mail.` +
        (r.stillOpen ? ` ${r.stillOpen} signalement${r.stillOpen > 1 ? 's' : ''} arrivé${r.stillOpen > 1 ? 's' : ''} entre-temps reste${r.stillOpen > 1 ? 'nt' : ''} ouvert${r.stillOpen > 1 ? 's' : ''}.` : ''),
      at: Date.now(),
    };
  } catch (e) {
    if (e instanceof AdminError) return { ok: false, message: e.message, at: Date.now() };
    throw e;
  }
}
