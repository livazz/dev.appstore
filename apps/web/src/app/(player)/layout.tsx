import Link from 'next/link';
import { Suspense } from 'react';
import { SearchBar, SearchForm } from '@/components/catalog/SearchBar';
import { UserMenu } from '@/components/auth/UserMenu';
import { LEGAL_DOCUMENTS } from '@/lib/legal-versions';

/** En-tête du site joueur (maquettes) : logo D, recherche + catégories, zone compte. */
export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:h-16 sm:flex-nowrap sm:gap-6 sm:px-6 sm:py-0">
          <Link
            href="/"
            aria-label="Dev AppStore — accueil"
            className="grid size-11 flex-none place-items-center rounded-[10px] bg-brand text-xl font-black text-ink shadow-[inset_0_-2px_0_rgba(0,0,0,.12)]"
          >
            D
          </Link>
          <div className="order-3 flex w-full min-w-0 justify-center sm:order-2 sm:w-auto sm:flex-1">
            <div className="flex w-full max-w-xl">
              <Suspense fallback={<SearchForm />}>
                <SearchBar />
              </Suspense>
            </div>
          </div>
          <div className="order-2 ml-auto flex flex-none items-center sm:order-3 sm:ml-0">
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© Dev AppStore — achats in-app sur le web, livrés automatiquement dans votre jeu.</p>
          <nav aria-label="Liens de pied de page" className="flex flex-wrap gap-x-4">
            {LEGAL_DOCUMENTS.map((d) => (
              <Link key={d.slug} href={d.href} className="inline-flex min-h-11 items-center hover:text-ink">
                {d.shortTitle}
              </Link>
            ))}
            <Link href="/pour-les-studios" className="inline-flex min-h-11 items-center hover:text-ink">
              Vous êtes un studio ?
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
