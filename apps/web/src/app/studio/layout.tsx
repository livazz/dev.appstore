import Link from 'next/link';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/server/session';

export const metadata: Metadata = { title: 'Espace studio — Wolleen' };
export const dynamic = 'force-dynamic';

/**
 * En-tête de l'espace studio (inspiré d'App Store Connect).
 * Pas de requireUser ici : /studio/signup (tâche « auth ») partage ce layout ; chaque page protège son accès.
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const initials = (user?.name ?? '')
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
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
          {/* Emplacement du UserMenu (tâche « auth ») — affichage minimal en attendant. */}
          <div className="flex items-center gap-2 text-sm" data-slot="user-menu">
            <Link href="/" className="hidden text-ink-2 hover:text-ink sm:inline">Voir le site</Link>
            {user ? (
              <>
                <span className="flex size-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white" title={user.email}>
                  {initials || '?'}
                </span>
                <span className="hidden max-w-40 truncate font-medium md:inline">{user.name}</span>
              </>
            ) : (
              <Link href="/login?next=/studio" className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-white">Se connecter</Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
