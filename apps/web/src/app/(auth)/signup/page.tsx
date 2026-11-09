import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { SignupForm } from '@/components/auth/forms';
import { SocialButtons } from '@/components/auth/SocialButtons';
import { safeNext, withNext } from '@/lib/auth/next-url';
import { enabledSocialProviders } from '@/server/auth';
import { getCurrentUser } from '@/server/session';

export const metadata: Metadata = { title: 'Créer un compte — Dev AppStore' };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getCurrentUser()) redirect(next);

  return (
    <AuthCard
      title="Créer un compte"
      subtitle="Liez vos jeux et achetez vos objets directement sur le web."
      footer={
        <>
          Déjà un compte ?{' '}
          <Link href={withNext('/login', next)} className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      <SocialButtons providers={enabledSocialProviders()} next={next} />
      <SignupForm next={next} />
    </AuthCard>
  );
}
