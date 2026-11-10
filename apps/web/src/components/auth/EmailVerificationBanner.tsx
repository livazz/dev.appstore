import Link from 'next/link';
import { getCurrentUser } from '@/server/session';
import { ResendVerificationForm } from './forms';

/**
 * Revue de sécurité A-04 : invitation à confirmer l'adresse e-mail, affichée aux comptes connectés non vérifiés
 * (sites joueur et studio). Rien pour un visiteur ou un compte vérifié.
 */
export async function EmailVerificationBanner() {
  const user = await getCurrentUser();
  if (!user || user.emailVerified !== false) return null;
  return (
    <div role="region" aria-label="Confirmation de l’adresse e-mail" className="border-b border-line bg-brand/20">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm text-ink sm:px-6">
        <p className="min-w-0 flex-1">
          Confirmez votre adresse <strong>{user.email}</strong> pour acheter, lier un compte de jeu et gérer un studio.{' '}
          <Link href="/verify-email" className="font-medium text-primary hover:underline">
            En savoir plus
          </Link>
        </p>
        <ResendVerificationForm compact />
      </div>
    </div>
  );
}
