import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { ResendVerificationForm } from '@/components/auth/forms';
import { getCurrentUser } from '@/server/session';

export const metadata: Metadata = { title: 'Confirmation de l’adresse e-mail', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Codes renvoyés par Better Auth (`/api/auth/verify-email` → `?error=…`). */
const ERRORS: Record<string, string> = {
  TOKEN_EXPIRED: 'Ce lien de confirmation a expiré.',
  INVALID_TOKEN: 'Ce lien de confirmation n’est pas valable.',
  USER_NOT_FOUND: 'Ce lien de confirmation n’est pas valable.',
};

/**
 * Revue de sécurité A-04 : page de retour du lien de vérification (`/api/auth/verify-email` redirige ici) et page
 * « Confirmez votre adresse » (bouton « Renvoyer l'e-mail »).
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const error = sp.error ? (ERRORS[sp.error] ?? ERRORS.INVALID_TOKEN) : null;

  if (!error && user?.emailVerified) {
    return (
      <AuthCard title="Adresse confirmée" subtitle={<>Merci, l’adresse <strong className="text-ink">{user.email}</strong> est confirmée.</>}>
        <p role="status" className="text-sm text-ink-2">
          Vous pouvez maintenant acheter, lier vos comptes de jeu et gérer votre studio.
        </p>
        <div className="mt-4 flex gap-3 text-sm">
          <Link href="/" className="font-medium text-primary hover:underline">
            Accueil
          </Link>
          <Link href="/studio" className="font-medium text-primary hover:underline">
            Espace studio
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (!user) {
    return (
      <AuthCard title="Confirmation de l’adresse" subtitle={error ?? (sp.done ? 'Lien traité.' : undefined)}>
        <p className="text-sm text-ink-2">
          {error ? 'Connectez-vous pour recevoir un nouveau lien de confirmation.' : 'Connectez-vous pour continuer.'}
        </p>
        <p className="mt-4 text-sm">
          <Link href="/login?next=%2Fverify-email" className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Confirmez votre adresse e-mail"
      subtitle={
        <>
          {error ? `${error} ` : null}Un lien de confirmation est envoyé à <strong className="text-ink">{user.email}</strong>.
        </>
      }
    >
      <p className="mb-4 text-sm text-ink-2">
        Tant que l’adresse n’est pas confirmée, l’achat, la liaison d’un compte de jeu et les actions sensibles de l’espace studio sont bloqués.
      </p>
      <ResendVerificationForm />
    </AuthCard>
  );
}
