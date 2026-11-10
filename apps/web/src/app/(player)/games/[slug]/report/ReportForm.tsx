'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';
import { CONTENT_POLICY_HREF, EXPLANATION_MAX, EXPLANATION_MIN, GOOD_FAITH_LABEL, REPORT_CATEGORIES } from '@/server/reports-logic';
import { submitReportAction, type ReportFormState } from './actions';

const initial: ReportFormState = {};

const input =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';
const label = 'mb-1.5 block text-sm font-medium text-ink';
const hint = 'mt-1 text-xs text-ink-2';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });

export function ReportForm({
  slug,
  gameName,
  items,
  defaultItemId,
  accountEmail,
}: {
  slug: string;
  gameName: string;
  items: { id: string; title: string }[];
  defaultItemId?: string;
  /** E-mail du compte connecté (prérempli), sinon saisie obligatoire. */
  accountEmail?: string;
}) {
  const [state, action, pending] = useActionState(submitReportAction, initial);
  const doneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.done) doneRef.current?.focus();
  }, [state.done]);

  if (state.done) {
    const d = state.done;
    return (
      <div ref={doneRef} tabIndex={-1} role="status" className="mt-6 rounded-[var(--radius)] border border-ok/30 bg-ok/10 p-5 outline-none">
        <h2 className="text-lg font-semibold text-ink">Signalement reçu</h2>
        <p className="mt-2 text-sm text-ink">
          Merci. Votre signalement concernant <strong>{d.itemTitle ? `${d.itemTitle} (${d.gameName})` : d.gameName}</strong> a bien été enregistré le{' '}
          {dateFmt.format(new Date(d.receivedAt))}. Une personne de l’équipe Dev AppStore va l’examiner et vous informera de la décision et de son motif.
        </p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-2">Référence</dt>
          <dd className="font-mono break-all">{d.reportId}</dd>
          <dt className="text-ink-2">Réponse à</dt>
          <dd className="break-all">{d.email}</dd>
        </dl>
        <p className="mt-3 text-sm text-ink-2">
          {d.ackSent
            ? 'Un accusé de réception vient de vous être envoyé par e-mail.'
            : 'L’accusé de réception n’a pas pu être envoyé par e-mail : conservez la référence ci-dessus.'}
        </p>
        <p className="mt-4">
          <Link href={`/games/${encodeURIComponent(slug)}`} className="text-sm font-semibold text-primary hover:underline">
            Retour à la boutique {gameName}
          </Link>
        </p>
      </div>
    );
  }

  const v = state.values;
  return (
    <form action={action} className="mt-6 flex flex-col gap-5">
      <input type="hidden" name="slug" value={slug} />
      {/* Piège à robots : invisible et ignoré par les lecteurs d'écran. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Site web
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="report-category" className={label}>
          Catégorie <span className="text-danger">*</span>
        </label>
        <select id="report-category" name="category" required defaultValue={v?.category ?? ''} className={input} key={`c-${v?.category ?? ''}`}>
          <option value="" disabled>
            Choisir…
          </option>
          {Object.entries(REPORT_CATEGORIES).map(([value, c]) => (
            <option key={value} value={value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="report-item" className={label}>
          Article visé <span className="font-normal text-ink-3">(facultatif)</span>
        </label>
        <select id="report-item" name="itemId" defaultValue={v?.itemId ?? defaultItemId ?? ''} className={input} key={`i-${v?.itemId ?? defaultItemId ?? ''}`}>
          <option value="">Le jeu dans son ensemble</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="report-explanation" className={label}>
          Explication <span className="text-danger">*</span>
        </label>
        <textarea
          id="report-explanation"
          name="explanation"
          required
          minLength={EXPLANATION_MIN}
          maxLength={EXPLANATION_MAX}
          rows={6}
          defaultValue={v?.explanation ?? ''}
          aria-describedby="report-explanation-hint"
          className={input}
        />
        <p id="report-explanation-hint" className={hint}>
          De {EXPLANATION_MIN} à {EXPLANATION_MAX} caractères. Indiquez précisément ce qui pose problème (texte, visuel, prix, article) et pourquoi ce contenu vous
          paraît illicite ou contraire à la charte.
        </p>
      </div>

      <div>
        <label htmlFor="report-email" className={label}>
          Votre adresse e-mail <span className="text-danger">*</span>
        </label>
        <input
          id="report-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          defaultValue={v?.email ?? accountEmail ?? ''}
          aria-describedby="report-email-hint"
          className={input}
        />
        <p id="report-email-hint" className={hint}>
          Pour vous envoyer l’accusé de réception et la décision. Elle n’est pas communiquée au studio.
        </p>
      </div>

      <label className="flex items-start gap-3 text-sm text-ink">
        <input type="checkbox" name="goodFaith" required defaultChecked={v?.goodFaith ?? false} className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" />
        <span>{GOOD_FAITH_LABEL}</span>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={CONTENT_POLICY_HREF} className="text-sm text-ink-2 underline hover:text-ink">
          Ce qui est interdit
        </Link>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
        >
          {pending ? 'Envoi…' : 'Envoyer le signalement'}
        </button>
      </div>
    </form>
  );
}
