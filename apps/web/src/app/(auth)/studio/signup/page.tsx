import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { StudioSignupForm } from '@/components/auth/forms';
import { safeNext, withNext } from '@/lib/auth/next-url';
import { getCurrentUser } from '@/server/session';

export const metadata: Metadata = { title: 'Créer un studio', alternates: { canonical: '/studio/signup' }, robots: { index: false } };

/*
 * Placée dans le groupe (auth) — et non sous app/studio/ — pour ne pas hériter de la mise en page de l'espace studio
 * (qui exige d'être connecté et membre d'un studio).
 */
export default async function StudioSignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, '/studio');
  const user = await getCurrentUser();

  return (
    <AuthCard
      title="Créer un studio"
      subtitle="Vendez vos objets in-app sur le web et gardez environ 95 % du revenu."
      footer={
        user ? null : (
          <>
            Déjà un compte ?{' '}
            <Link href={withNext('/login', '/studio/signup')} className="font-medium text-primary hover:underline">
              Se connecter
            </Link>{' '}
            puis créez votre studio.
          </>
        )
      }
    >
      <StudioSignupForm next={next} signedInAs={user ? `${user.name} (${user.email})` : undefined} />
    </AuthCard>
  );
}
