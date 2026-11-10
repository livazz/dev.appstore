'use server';

import { AdminError } from '@/server/admin';
import { setReviewStatus } from '@/server/reviews';
import type { AdminActionState } from '@/components/admin/action-state';

/* Masquer / réafficher un avis. `setReviewStatus` vérifie l'accès (404 sinon) et journalise dans la même transaction. */

const field = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === 'string' ? v : '';
};

export async function moderateReviewAction(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  try {
    const r = await setReviewStatus(field(form, 'reviewId'), { status: field(form, 'status'), reason: field(form, 'reason') });
    const message = !r.changed ? 'Aucun changement : l’avis avait déjà ce statut.' : r.status === 'hidden' ? 'Avis masqué.' : 'Avis réaffiché.';
    return { ok: true, message, at: Date.now() };
  } catch (e) {
    if (e instanceof AdminError) return { ok: false, message: e.message, at: Date.now() };
    throw e;
  }
}
