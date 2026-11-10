import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { ForgotPasswordForm } from '@/components/auth/forms';

export const metadata: Metadata = { title: 'Mot de passe oublié', alternates: { canonical: '/forgot-password' } };

/** Revue de sécurité A-04 : demande de réinitialisation (réponse neutre, limitée par IP et par adresse). */
export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Mot de passe oublié"
      subtitle="Saisissez l’adresse de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe."
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Retour à la connexion
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
