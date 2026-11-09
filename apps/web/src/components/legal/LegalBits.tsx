import type { ReactNode } from 'react';

/**
 * Champ à compléter avant publication (raison sociale, SIREN, médiateur…), clairement repérable :
 * fond jaune pâle, bordure pointillée, texte « [à compléter : …] » lu tel quel par les lecteurs d'écran.
 */
export function Todo({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[4px] border border-dashed border-warn bg-brand/25 px-1 py-px font-medium text-ink [box-decoration-break:clone] print:border-black print:bg-transparent">
      [à compléter : {children}]
    </span>
  );
}

/** Bandeau « Projet » affiché tant que les documents ne sont pas validés juridiquement. */
export function DraftBanner() {
  return (
    <div role="note" aria-label="Statut des documents" className="border-b border-warn/40 bg-brand/20">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 text-sm sm:px-6">
        <span aria-hidden="true" className="mt-0.5 grid size-5 flex-none place-items-center rounded-full bg-warn text-xs font-black text-white">
          !
        </span>
        <p className="min-w-0 text-ink">
          <strong className="font-semibold">Projet — en cours de validation juridique.</strong>{' '}
          <span className="text-ink-2">
            Ces documents ne sont pas encore définitifs. Les champs signalés <Todo>…</Todo> seront renseignés avant publication.
          </span>
        </p>
      </div>
    </div>
  );
}

/** Encadré d'information mis en valeur dans le corps d'un document. */
export function Callout({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mt-4 rounded-[var(--radius)] border border-line border-l-4 border-l-primary bg-bg px-4 py-3">
      {title ? <p className="!mt-0 font-semibold text-ink">{title}</p> : null}
      <div className="[&>p:first-child]:!mt-0">{children}</div>
    </div>
  );
}

/** Tableau à deux colonnes ou plus, défilant horizontalement dans son propre conteneur sur mobile. */
export function LegalTable({ head, rows, caption }: { head: string[]; rows: ReactNode[][]; caption?: string }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-[var(--radius)] border border-line" tabIndex={0} role="region" aria-label={caption ?? head.join(', ')}>
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="bg-bg text-ink">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="border-b border-line px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top even:bg-bg/50">
              {r.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="border-t border-line px-3 py-2 font-medium text-ink">
                    {cell}
                  </th>
                ) : (
                  <td key={j} className="border-t border-line px-3 py-2 text-ink-2">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
