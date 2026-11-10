import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { ResetPasswordForm } from '@/components/auth/forms';

// Le jeton est dans l'URL : jamais transmis à un autre site (Referer), page jamais indexée.
export const metadata: Metadata = { title: 'Nouveau mot de passe', referrer: 'no-referrer', robots: { index: false, follow: false } };

/** Revue de sécurité A-04 : nouveau mot de passe à partir du lien reçu par e-mail (jeton vérifié à l'envoi). */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const sp = await searchParams;
  const token = typeof sp.token === 'string' ? sp.token.slice(0, 256) : '';
  return (
    <AuthCard
      title="Nouveau mot de passe"
      subtitle="Choisissez un nouveau mot de passe. Vous serez ensuite déconnecté de tous vos appareils."
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Retour à la connexion
        </Link>
      }
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p role="alert" className="rounded-[var(--radius)] border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          Ce lien est incomplet.{' '}
          <Link href="/forgot-password" className="font-medium underline">
            Demandez un nouveau lien
          </Link>
          .
        </p>
      )}
    </AuthCard>
  );
}
