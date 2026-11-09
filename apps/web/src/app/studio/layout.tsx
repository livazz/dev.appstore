import Link from 'next/link';
import type { Metadata } from 'next';
import { UserMenu } from '@/components/auth/UserMenu';

export const metadata: Metadata = { title: 'Espace studio — Dev AppStore' };
export const dynamic = 'force-dynamic';

/**
 * En-tête de l'espace studio (inspiré d'App Store Connect).
 * Pas de requireUser ici : /studio/signup (tâche « auth ») partage ce layout ; chaque page protège son accès.
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        {/* 390 px : logo + menu compte sur la 1re ligne, navigation sur la 2e (aucun scroll horizontal). */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 px-4 py-1.5 sm:h-14 sm:flex-nowrap sm:px-6 sm:py-0">
          <Link href="/studio" className="flex min-h-11 min-w-0 items-center gap-3" aria-label="Espace studio — accueil">
            <span className="flex size-9 flex-none items-center justify-center rounded-xl bg-brand text-lg font-black text-ink shadow-sm">D</span>
            <span className="truncate text-base font-semibold">Espace studio</span>
          </Link>
          <nav
            className="order-3 -mx-3 flex w-full items-center text-sm text-ink-2 sm:order-none sm:mx-0 sm:ml-2 sm:w-auto"
            aria-label="Navigation studio"
          >
            <Link href="/studio" className="inline-flex min-h-11 items-center rounded-[var(--radius)] px-3 hover:bg-black/5 hover:text-ink">
              Mes jeux
            </Link>
            <Link href="/studio/payouts" className="inline-flex min-h-11 items-center rounded-[var(--radius)] px-3 hover:bg-black/5 hover:text-ink">
              Paiements
            </Link>
            <Link href="/docs" className="inline-flex min-h-11 items-center rounded-[var(--radius)] px-3 hover:bg-black/5 hover:text-ink">
              Documentation
            </Link>
          </nav>
          <div className="ml-auto flex-none">
            <UserMenu variant="studio" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
