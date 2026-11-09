import Link from 'next/link';
import type { ReactNode } from 'react';
import { DocsSearch } from '@/components/docs/DocsSearch';
import { DocsSidebar } from '@/components/docs/DocsSidebar';

/** Documentation développeur publique (/docs) : en-tête, recherche, navigation latérale. */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[var(--radius)] focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
      >
        Aller au contenu
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link href="/docs" className="flex shrink-0 items-center gap-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label="Documentation Dev AppStore — accueil">
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-md bg-brand text-base font-black text-ink">
              D
            </span>
            <span aria-hidden="true" className="hidden font-semibold sm:inline">
              Dev AppStore <span className="font-normal text-ink-3">Docs</span>
            </span>
          </Link>
          <div className="min-w-0 flex-1">
            <DocsSearch />
          </div>
          <nav aria-label="Liens du site" className="hidden items-center gap-4 text-sm text-ink-2 md:flex">
            <Link href="/pour-les-studios" className="hover:text-ink">
              Pour les studios
            </Link>
            <Link href="/studio" className="rounded-[var(--radius)] bg-primary px-3 py-2 font-semibold text-white hover:opacity-90">
              Espace studio
            </Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl lg:flex lg:gap-8 lg:px-6">
        <DocsSidebar />
        <main id="contenu" className="min-w-0 flex-1 px-4 sm:px-6 lg:px-0">
          {children}
        </main>
      </div>
    </div>
  );
}
