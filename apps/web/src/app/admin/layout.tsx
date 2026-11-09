import Link from 'next/link';
import type { Metadata } from 'next';
import { getPlatformAdmin, requirePlatformAdmin } from '@/server/admin';
import { ADMIN_ROLE_LABELS, can, type AdminPermission } from '@/server/admin-logic';
import { AdminNav, type AdminNavLink } from '@/components/admin/AdminNav';

export const dynamic = 'force-dynamic';

/** Titre uniquement pour un administrateur : la page 404 servie aux autres ne révèle rien. */
export async function generateMetadata(): Promise<Metadata> {
  const admin = await getPlatformAdmin();
  return admin ? { title: { default: 'Administration — Dev AppStore', template: '%s — Administration Dev AppStore' }, robots: { index: false, follow: false } } : {};
}

const LINKS: (AdminNavLink & { permission: AdminPermission })[] = [
  { href: '/admin', label: 'Tableau de bord', permission: 'dashboard.read' },
  { href: '/admin/games', label: 'Jeux', permission: 'games.read' },
  { href: '/admin/studios', label: 'Studios', permission: 'studios.read' },
  { href: '/admin/orders', label: 'Commandes', permission: 'orders.read' },
  { href: '/admin/users', label: 'Utilisateurs', permission: 'users.read' },
  { href: '/admin/audit', label: 'Journal d’audit', permission: 'audit.read' },
];

/**
 * Back-office de l'équipe Dev AppStore. Réservé aux administrateurs de la plateforme : tout autre visiteur
 * reçoit une 404. Chaque page et chaque action revérifie l'accès (le layout seul ne protège pas les Server Actions).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();
  const links = LINKS.filter((l) => can(admin.role, l.permission)).map(({ href, label }) => ({ href, label }));

  return (
    <div className="min-h-screen bg-bg">
      <div className="bg-ink text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider sm:px-6">
          <span className="size-2 rounded-full bg-brand" aria-hidden />
          Administration
          <span className="ml-auto hidden truncate font-normal normal-case tracking-normal text-white/70 sm:inline">Espace interne — toutes les actions sont journalisées</span>
          <span className="ml-auto font-normal normal-case tracking-normal text-white/70 sm:hidden">Actions journalisées</span>
        </div>
      </div>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/admin" className="flex min-w-0 items-center gap-2.5" aria-label="Administration Dev AppStore — tableau de bord">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand text-lg font-black text-ink shadow-sm" aria-hidden>
              D
            </span>
            <span className="truncate text-base font-semibold">Dev AppStore</span>
          </Link>
          <span className="flex-1" />
          <span className="hidden min-w-0 truncate text-sm text-ink-2 sm:inline">{admin.user.email}</span>
          <span className="shrink-0 rounded-full bg-brand/30 px-2 py-0.5 text-xs font-semibold text-ink">{ADMIN_ROLE_LABELS[admin.role]}</span>
          <Link href="/" className="shrink-0 rounded-[var(--radius)] px-2 py-1.5 text-sm font-medium text-ink-2 hover:bg-black/5 hover:text-ink">
            <span className="sm:hidden">Site</span>
            <span className="hidden sm:inline">Retour au site</span>
          </Link>
        </div>
        <div className="mx-auto max-w-7xl px-2 sm:px-4">
          <AdminNav links={links} />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
