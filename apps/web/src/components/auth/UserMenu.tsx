import Link from 'next/link';
import { getCurrentUser, getUserStudios } from '@/server/session';
import { signOutAction } from './actions';
import { accountMenuLinks, type UserMenuVariant } from './account-menu';
import { AccountMenuDisclosure } from './AccountMenuDisclosure';

/** Cible tactile ≥ 44 px (WCAG 2.5.5) pour chaque entrée du menu. */
const inlineItem = 'inline-flex min-h-11 items-center rounded-[var(--radius)] px-3 font-medium whitespace-nowrap hover:bg-black/5';
const menuItem = 'flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-ink hover:bg-bg';

/**
 * Menu compte pour les en-têtes (Server Component) :
 * - visiteur : « Se connecter » + « Créer un compte » ;
 * - connecté : « Espace studio » s'il est membre d'un studio, « Mes points » (joueur), avatar et nom (→ /account),
 *   « Se déconnecter ». En ligne à partir de lg ; en dessous, menu replié derrière l'avatar (pas de scroll
 *   horizontal à 390 px).
 * `variant="studio"` remplace Espace studio / Mes points par « Retour au site ».
 */
export async function UserMenu({ variant = 'player' }: { variant?: UserMenuVariant }) {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <nav aria-label="Compte" className="flex items-center gap-1 text-sm sm:gap-2">
        <Link href="/login" className={`${inlineItem} text-ink`}>
          Se connecter
        </Link>
        <Link href="/signup" className="inline-flex min-h-11 items-center rounded-[var(--radius)] bg-primary px-3 font-semibold whitespace-nowrap text-white hover:brightness-90">
          Créer un compte
        </Link>
      </nav>
    );
  }

  const isStudioMember = variant === 'player' && (await getUserStudios(user.id)).length > 0;
  const links = accountMenuLinks({ variant, isStudioMember });
  const initial = (user.name.trim()[0] ?? user.email[0] ?? '?').toUpperCase();
  const avatar = (
    <span aria-hidden="true" className="grid size-7 flex-none place-items-center rounded-full bg-brand text-xs font-bold text-ink">
      {initial}
    </span>
  );

  return (
    <nav aria-label="Compte" className="text-sm">
      {/* Bureau : tout en ligne. */}
      <div className="hidden items-center gap-1 lg:flex">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={`${inlineItem} text-ink`}>
            {l.label}
          </Link>
        ))}
        <Link href="/account" className={`${inlineItem} gap-2 px-2`} title={user.email}>
          {avatar}
          <span className="max-w-[12rem] truncate text-ink">
            <span className="sr-only">Mon compte : </span>
            {user.name}
          </span>
        </Link>
        <form action={signOutAction}>
          <button type="submit" className={`${inlineItem} text-ink-2 hover:text-ink`}>
            Se déconnecter
          </button>
        </form>
      </div>

      {/* Mobile et tablette : menu replié derrière l'avatar. */}
      <AccountMenuDisclosure className="lg:hidden" summary={avatar} summaryLabel={`Menu du compte (${user.name})`}>
        <p className="truncate px-3 pt-1.5 pb-1 text-xs text-ink-3" title={user.email}>
          {user.name}
          <span className="block truncate">{user.email}</span>
        </p>
        <Link href="/account" className={menuItem}>
          Mon compte
        </Link>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={menuItem}>
            {l.label}
          </Link>
        ))}
        <hr className="my-1 border-line" />
        <form action={signOutAction}>
          <button type="submit" className={`${menuItem} text-ink-2`}>
            Se déconnecter
          </button>
        </form>
      </AccountMenuDisclosure>
    </nav>
  );
}
