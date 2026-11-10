'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/server/auth';
import {
  requestPasswordReset,
  resendVerificationEmail,
  resetPasswordWithToken,
  signInWithPassword,
  signUpStudio,
  signUpWithPassword,
} from '@/server/auth-flows';
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
  // Revue A-07 : même écran que l'adresse soit libre ou déjà inscrite ; aucune session ouverte.
  return { done: true, values: { email: values.email } };
}

export async function studioSignupAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const current = await getCurrentUser();
  const values = { studioName: str(formData.get('studioName')), name: str(formData.get('name')), email: str(formData.get('email')) };
  const res = await signUpStudio(
    { ...values, password: str(formData.get('password')) },
    { headers: await headers(), currentUserId: current?.id ?? null },
  );
  if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors, values };
  // Nouveau compte (ou adresse déjà inscrite, même réponse) : confirmation par e-mail avant connexion.
  if (res.verificationSent) return { done: true, values: { email: values.email } };
  revalidatePath('/', 'layout');
  redirect(safeNext(formData.get('next'), '/studio'));
}

/** « Mot de passe oublié ? » — réponse neutre. */
export async function forgotPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = str(formData.get('email'));
  const res = await requestPasswordReset({ email }, { headers: await headers() });
  if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors, values: { email } };
  return { done: true, values: { email } };
}

/** Nouveau mot de passe (jeton du lien reçu par e-mail). Toutes les sessions sont fermées : retour à la connexion. */
export async function resetPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const res = await resetPasswordWithToken(
    { token: str(formData.get('token')), password: str(formData.get('password')), confirmPassword: str(formData.get('confirmPassword')) },
    { headers: await headers() },
  );
  if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors };
  revalidatePath('/', 'layout');
  redirect('/login?reset=1');
}

/** « Renvoyer l'e-mail » de vérification (utilisateur connecté). */
export async function resendVerificationAction(_prev: AuthFormState, _formData: FormData): Promise<AuthFormState> {
  const current = await getCurrentUser();
  if (!current) redirect('/login?next=%2Fverify-email');
  const res = await resendVerificationEmail(current, { headers: await headers() });
  if (!res.ok) return { error: res.error };
  if (res.alreadyVerified) {
    revalidatePath('/', 'layout');
    redirect('/verify-email?done=1');
  }
  return { done: true };
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
