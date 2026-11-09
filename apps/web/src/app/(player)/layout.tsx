import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SearchBar, SearchForm } from '@/components/catalog/SearchBar';
import { UserMenu } from '@/components/auth/UserMenu';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || 'http://localhost:3000'),
  title: { default: 'Wolleen — vos achats in-app moins cher, sur le web', template: '%s · Wolleen' },
  description:
    'Trouvez votre jeu, liez votre compte et achetez vos objets in-app moins cher qu’en jeu. Livraison automatique dans le jeu.',
  openGraph: { siteName: 'Wolleen', type: 'website', locale: 'fr_FR' },
};

/** En-tête du site joueur (maquettes) : logo W, recherche + catégories, zone compte. */
export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:h-16 sm:flex-nowrap sm:gap-6 sm:px-6 sm:py-0">
          <Link
            href="/"
            aria-label="Wolleen — accueil"
            className="grid size-11 flex-none place-items-center rounded-[10px] bg-brand text-xl font-black text-ink shadow-[inset_0_-2px_0_rgba(0,0,0,.12)]"
          >
            W
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
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© Wolleen — achats in-app sur le web, livrés automatiquement dans votre jeu.</p>
          <Link href="/studio" className="hover:text-ink">
            Vous êtes un studio ?
          </Link>
        </div>
      </footer>
    </div>
  );
}
