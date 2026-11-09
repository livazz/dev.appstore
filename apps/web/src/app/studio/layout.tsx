import Link from 'next/link';
import type { Metadata } from 'next';
import { UserMenu } from '@/components/auth/UserMenu';

export const metadata: Metadata = { title: 'Espace studio — Wolleen' };
export const dynamic = 'force-dynamic';

/**
 * En-tête de l'espace studio (inspiré d'App Store Connect).
 * Pas de requireUser ici : /studio/signup (tâche « auth ») partage ce layout ; chaque page protège son accès.
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/studio" className="flex items-center gap-3" aria-label="Espace studio — accueil">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand text-lg font-black text-ink shadow-sm">W</span>
            <span className="text-base font-semibold">Espace studio</span>
          </Link>
          <nav className="ml-4 hidden items-center gap-4 text-sm text-ink-2 sm:flex" aria-label="Navigation studio">
            <Link href="/studio" className="hover:text-ink">Mes jeux</Link>
            <Link href="/studio/payouts" className="hover:text-ink">Paiements</Link>
          </nav>
          <span className="flex-1" />
          <UserMenu variant="studio" />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
