import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { LoginForm } from '@/components/auth/forms';
import { SocialButtons } from '@/components/auth/SocialButtons';
import { safeNext, withNext } from '@/lib/auth/next-url';
import { enabledSocialProviders } from '@/server/auth';
import { getCurrentUser } from '@/server/session';

export const metadata: Metadata = { title: 'Connexion', alternates: { canonical: '/login' } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; reauth?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  // Ré-authentification (A-11, session trop ancienne pour une action sensible) : on redemande le mot de passe
  // même si l'utilisateur est connecté ; la nouvelle session est fraîche.
  const reauth = sp.reauth === '1';
  if (!reauth && (await getCurrentUser())) redirect(next);

  return (
    <AuthCard
      title="Connexion"
      subtitle="Retrouvez vos jeux liés et vos achats."
      footer={
        <>
          Pas encore de compte ?{' '}
          <Link href={withNext('/signup', next)} className="font-medium text-primary hover:underline">
            Créer un compte
          </Link>
          <span className="mx-2 text-ink-3" aria-hidden="true">·</span>
          <Link href={withNext('/studio/signup', sp.next ? next : undefined)} className="font-medium text-primary hover:underline">
            Vous êtes un studio ?
          </Link>
        </>
      }
    >
      {reauth ? (
        <p role="status" className="mb-4 rounded-[var(--radius)] border border-line bg-surface px-3 py-2 text-sm text-ink-2">
          Par sécurité, confirmez votre identité pour continuer : reconnectez-vous.
        </p>
      ) : null}
            {sp.error === 'social' ? (
        <p role="alert" className="mb-4 rounded-[var(--radius)] border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          La connexion avec ce fournisseur a échoué. Réessayez ou utilisez votre e-mail.
        </p>
      ) : null}
      <SocialButtons providers={enabledSocialProviders()} next={next} />
      <LoginForm next={next} />
    </AuthCard>
  );
}
