'use server';

import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/server/auth';
import { signInWithPassword } from '@/server/auth-flows';
import { DEMO_ROLE_PASSWORD, DEMO_ROLES, isRoleSwitcherEnabled } from '@/lib/demo-roles';

/** Ferme la session courante et ouvre celle du compte de démo choisi (développement uniquement : 404 sinon). */
export async function switchDemoRoleAction(formData: FormData): Promise<void> {
  if (!isRoleSwitcherEnabled()) notFound();
  const target = DEMO_ROLES.find((r) => r.role === formData.get('role'));
  if (!target) notFound();
  const h = await headers();
  try {
    await auth.api.signOut({ headers: h });
  } catch {
    // Pas de session : rien à fermer.
  }
  const res = await signInWithPassword({ email: target.email, password: DEMO_ROLE_PASSWORD }, { headers: h });
  if (!res.ok) redirect(`/login?error=${encodeURIComponent('Compte de démo indisponible : lancez npm run db:seed.')}`);
  revalidatePath('/', 'layout');
  redirect(target.home);
}
