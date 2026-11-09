import Link from 'next/link';
import type { ReactNode } from 'react';

const navLink =
  'rounded px-2 py-1 text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** Mise en page des pages marketing (studios…) : en-tête léger et pied de page. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius)] focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
      >
        Aller au contenu
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 rounded font-bold focus-visible:outline-2 focus-visible:outline-primary" aria-label="Wolleen, retour au catalogue">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-brand text-lg font-black text-ink">
              W
            </span>
            <span aria-hidden="true" className="hidden sm:inline">Wolleen</span>
          </Link>
          <nav aria-label="Navigation principale" className="flex items-center gap-1 text-sm sm:gap-3">
            <Link href="/" className={navLink}>
              Catalogue
            </Link>
            <Link href="/pour-les-studios" className={navLink}>
              Studios
            </Link>
            <Link
              href="/studio/signup"
              className="rounded-[var(--radius)] bg-primary px-3 py-2 font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Espace studio
            </Link>
          </nav>
        </div>
      </header>
      <main id="contenu" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Wolleen — achats in-app sur le web.</p>
          <nav aria-label="Liens de pied de page" className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/" className="hover:text-ink">Catalogue</Link>
            <Link href="/pour-les-studios" className="hover:text-ink">Pour les studios</Link>
            <Link href="/studio/signup" className="hover:text-ink">Créer un espace studio</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
