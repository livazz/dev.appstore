import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { LoginForm } from '@/components/auth/forms';
import { SocialButtons } from '@/components/auth/SocialButtons';
import { safeNext, withNext } from '@/lib/auth/next-url';
import { enabledSocialProviders } from '@/server/auth';
import { getCurrentUser } from '@/server/session';

export const metadata: Metadata = { title: 'Connexion — Dev AppStore' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getCurrentUser()) redirect(next);

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
