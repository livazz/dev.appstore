'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/server/auth';
import { signInWithPassword, signUpStudio, signUpWithPassword } from '@/server/auth-flows';
import { getCurrentUser } from '@/server/session';
import { safeNext } from '@/lib/auth/next-url';
import type { AuthFormState } from '@/components/auth/form-state';

/** Valeur texte d'un champ, tronquée (les schémas zod refusent au-delà des longueurs max ; ceci borne l'écho). */
function str(v: FormDataEntryValue | null, max = 512): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = str(formData.get('email'));
  const res = await signInWithPassword({ email, password: str(formData.get('password')) }, { headers: await headers() });
  if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors, values: { email } };
  revalidatePath('/', 'layout');
  redirect(safeNext(formData.get('next')));
}

export async function signupAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { name: str(formData.get('name')), email: str(formData.get('email')) };
  const res = await signUpWithPassword({ ...values, password: str(formData.get('password')) }, { headers: await headers() });
  if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors, values };
  revalidatePath('/', 'layout');
  redirect(safeNext(formData.get('next')));
}

export async function studioSignupAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const current = await getCurrentUser();
  const values = { studioName: str(formData.get('studioName')), name: str(formData.get('name')), email: str(formData.get('email')) };
  const res = await signUpStudio(
    { ...values, password: str(formData.get('password')) },
    { headers: await headers(), currentUserId: current?.id ?? null },
  );
  if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors, values };
  revalidatePath('/', 'layout');
  redirect(safeNext(formData.get('next'), '/studio'));
}

export async function signOutAction(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Pas de session valide : rien à fermer.
  }
  revalidatePath('/', 'layout');
  redirect('/');
}
