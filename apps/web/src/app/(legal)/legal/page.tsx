import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL_DOCUMENTS, formatLegalDate } from '@/lib/legal-versions';

export const metadata: Metadata = { title: 'Informations légales' };

const AUDIENCE = { joueurs: 'Joueurs', studios: 'Studios', tous: 'Tous' } as const;

export default function LegalIndexPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold sm:text-3xl">Informations légales</h1>
      <p className="mt-2 max-w-2xl text-ink-2">
        Dev AppStore est une place de marché : chaque objet est vendu par le studio qui édite le jeu, Dev AppStore fournit le site, le
        paiement et la livraison automatique dans le jeu. Retrouvez ici les règles qui s’appliquent.
      </p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {LEGAL_DOCUMENTS.map((d) => (
          <li key={d.slug}>
            <Link
              href={d.href}
              className="flex h-full flex-col rounded-[var(--radius)] border border-line bg-surface p-5 hover:border-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">{AUDIENCE[d.audience]}</span>
              <span className="mt-1 font-semibold text-ink">{d.title}</span>
              <span className="mt-2 flex-1 text-sm text-ink-2">{d.description}</span>
              <span className="mt-3 text-xs text-ink-3">
                Version du <time dateTime={d.version}>{formatLegalDate(d.version)}</time>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
