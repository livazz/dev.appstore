import Link from 'next/link';
import { getCurrentUser, getUserStudios } from '@/server/session';
import { signOutAction } from './actions';

/**
 * Menu compte pour les en-têtes (Server Component) :
 * - visiteur : « Se connecter » + « Créer un compte » ;
 * - connecté : nom, lien « Espace studio » s'il est membre d'un studio, et « Se déconnecter ».
 * `variant="studio"` masque le lien Espace studio (déjà dans l'espace studio) et affiche « Retour au site ».
 */
export async function UserMenu({ variant = 'player' }: { variant?: 'player' | 'studio' }) {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <nav aria-label="Compte" className="flex items-center gap-2 text-sm">
        <Link href="/login" className="rounded-[var(--radius)] px-3 py-1.5 font-medium text-ink hover:bg-black/5">
          Se connecter
        </Link>
        <Link href="/signup" className="rounded-[var(--radius)] bg-primary px-3 py-1.5 font-semibold text-white hover:opacity-90">
          Créer un compte
        </Link>
      </nav>
    );
  }

  const isStudioMember = (await getUserStudios(user.id)).length > 0;
  const initial = (user.name.trim()[0] ?? user.email[0] ?? '?').toUpperCase();

  return (
    <nav aria-label="Compte" className="flex items-center gap-1 text-sm">
      {variant === 'player' && isStudioMember ? (
        <Link href="/studio" className="rounded-[var(--radius)] px-3 py-1.5 font-medium text-ink hover:bg-black/5">
          Espace studio
        </Link>
      ) : null}
      {variant === 'studio' ? (
        <Link href="/" className="rounded-[var(--radius)] px-3 py-1.5 font-medium text-ink hover:bg-black/5">
          Retour au site
        </Link>
      ) : null}
      <Link
        href="/account"
        className="flex items-center gap-2 rounded-[var(--radius)] px-2 py-1 hover:bg-black/5"
        title={user.email}
      >
        <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-brand text-xs font-bold text-ink">
          {initial}
        </span>
        <span className="max-w-[12rem] truncate font-medium text-ink">
          <span className="sr-only">Mon compte : </span>
          {user.name}
        </span>
      </Link>
      <form action={signOutAction}>
        <button type="submit" className="rounded-[var(--radius)] px-3 py-1.5 font-medium text-ink-2 hover:bg-black/5 hover:text-ink">
          Se déconnecter
        </button>
      </form>
    </nav>
  );
}
