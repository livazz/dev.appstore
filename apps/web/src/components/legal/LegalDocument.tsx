import type { ReactNode } from 'react';
import { formatLegalDate, getLegalDocument, type LegalSlug } from '@/lib/legal-versions';

export interface LegalSection {
  /** Ancre (`#id`), stable : elle peut être citée dans un e-mail ou une autre page. */
  id: string;
  title: string;
  body: ReactNode;
}

/** Typographie de lecture des documents (pas de plugin typography : sélecteurs descendants). */
const prose = [
  'text-[0.975rem] leading-7 text-ink-2',
  '[&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-ink',
  '[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5',
  '[&_li]:pl-1 [&_li::marker]:text-ink-3',
  '[&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-ink',
  '[&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:decoration-primary [&_a]:decoration-2 [&_a]:underline-offset-2 hover:[&_a]:decoration-ink',
  '[&_code]:rounded [&_code]:bg-bg [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-ink',
  '[overflow-wrap:anywhere] sm:[overflow-wrap:normal]',
].join(' ');

/**
 * Gabarit d'un document légal : titre, version datée, sommaire latéral des sections (à droite sur grand
 * écran, en tête de page sinon) et sections numérotées avec ancres.
 */
export function LegalDocument({ slug, intro, sections }: { slug: LegalSlug; intro?: ReactNode; sections: LegalSection[] }) {
  const doc = getLegalDocument(slug);
  return (
    <article className="min-w-0 xl:grid xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-10">
      <nav
        aria-labelledby="sommaire-titre"
        className="mb-8 rounded-[var(--radius)] border border-line bg-surface p-4 xl:order-last xl:sticky xl:top-24 xl:mb-0 xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto xl:border-0 xl:bg-transparent xl:p-0 print:hidden"
      >
        <h2 id="sommaire-titre" className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          Sommaire
        </h2>
        <ol className="mt-2 space-y-1 text-sm">
          {sections.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="flex gap-2 rounded px-1 py-1 text-ink-2 hover:bg-bg hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span aria-hidden="true" className="w-5 flex-none tabular-nums text-ink-3">
                  {i + 1}.
                </span>
                <span>{s.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="min-w-0 rounded-[var(--radius)] border border-line bg-surface px-4 py-6 sm:px-8 sm:py-8 print:border-0 print:p-0">
        <header className="border-b border-line pb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
            {doc.audience === 'joueurs' ? 'Joueurs' : doc.audience === 'studios' ? 'Studios' : 'Tous les utilisateurs'}
          </p>
          <h1 className="mt-1 text-2xl font-bold leading-tight text-ink sm:text-3xl">{doc.title}</h1>
          <p className="mt-2 text-sm text-ink-2">
            Version du <time dateTime={doc.version}>{formatLegalDate(doc.version)}</time> · projet, non encore en vigueur
          </p>
        </header>

        {intro ? <div className={`mt-5 ${prose}`}>{intro}</div> : null}

        {sections.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-titre`} className="mt-8 scroll-mt-24">
            <h2 id={`${s.id}-titre`} className="text-lg font-semibold leading-snug text-ink sm:text-xl">
              <span className="text-ink-3">{i + 1}.</span> {s.title}
            </h2>
            <div className={prose}>{s.body}</div>
          </section>
        ))}

        <p className="mt-10 border-t border-line pt-4 text-xs text-ink-3">
          Dev AppStore — {doc.shortTitle}, version du {formatLegalDate(doc.version)}. Rien dans ce document ne limite les droits que vous tenez de la loi.
        </p>
      </div>
    </article>
  );
}
