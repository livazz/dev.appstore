import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DraftBanner } from '@/components/legal/LegalBits';
import { LegalNav } from '@/components/legal/LegalNav';
import { LEGAL_STATUS } from '@/lib/legal-versions';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || 'http://localhost:3000'),
  title: { default: 'Informations légales · Dev AppStore', template: '%s · Dev AppStore' },
  description: 'Conditions de vente, conditions studio, confidentialité, cookies, mentions légales et droit de rétractation de Dev AppStore.',
  // Projets non validés : pas d'indexation tant que le bandeau « Projet » est affiché.
  robots: LEGAL_STATUS === 'draft' ? { index: false, follow: true } : undefined,
};

/** Mise en page des pages légales : en-tête simple (logo D + retour), bandeau « Projet », sommaire latéral. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip bg-bg text-ink">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius)] focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
      >
        Aller au contenu
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur print:static">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label="Dev AppStore — accueil"
          >
            <span
              aria-hidden="true"
              className="grid size-10 flex-none place-items-center rounded-[10px] bg-brand text-xl font-black text-ink shadow-[inset_0_-2px_0_rgba(0,0,0,.12)]"
            >
              D
            </span>
            <span className="min-w-0 leading-tight" aria-hidden="true">
              <span className="block font-bold">Dev AppStore</span>
              <span className="block text-xs text-ink-3">Informations légales</span>
            </span>
          </Link>
          <Link
            href="/"
            className="flex-none rounded-[var(--radius)] px-2 py-2 text-sm font-medium text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-primary print:hidden"
          >
            <span aria-hidden="true">← </span>Retour<span className="hidden sm:inline"> au catalogue</span>
          </Link>
        </div>
      </header>

      {LEGAL_STATUS === 'draft' ? <DraftBanner /> : null}

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <aside className="mb-6 lg:sticky lg:top-24 lg:mb-0 lg:self-start">
          <LegalNav />
        </aside>
        <main id="contenu" className="min-w-0">
          {children}
        </main>
      </div>

      <footer className="border-t border-line bg-surface print:hidden">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Dev AppStore — achats in-app sur le web.</p>
          <Link href="/legal" className="hover:text-ink">
            Tous les documents légaux
          </Link>
        </div>
      </footer>
    </div>
  );
}
