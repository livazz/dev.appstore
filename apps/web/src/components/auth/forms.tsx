'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { forgotPasswordAction, loginAction, resendVerificationAction, resetPasswordAction, signupAction, studioSignupAction } from './actions';
import { Field, FormActions, FormError } from './fields';
import { initialAuthFormState } from './form-state';
import { SiteArt } from '@/components/SiteArt';

const PASSWORD_HINT = 'Au moins 8 caractères.';

/** Confirmation affichée à la place du formulaire (annoncée aux lecteurs d'écran). */
function Notice({ title, children, art }: { title: string; children: React.ReactNode; art?: boolean }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-[var(--radius)] border border-line bg-bg px-4 py-3 text-sm text-ink-2">
      {art ? <SiteArt name="email-verify" priority className="mx-auto size-28" /> : null}
      <p className="font-semibold text-ink">{title}</p>
      {children}
    </div>
  );
}

/** Après une inscription : même message que l'adresse soit libre ou déjà inscrite (revue A-07). */
function CheckYourInbox({ email }: { email?: string }) {
  return (
    <Notice title="Vérifiez votre boîte mail" art>
      <p>
        Nous avons envoyé un e-mail à <strong className="text-ink">{email || 'votre adresse'}</strong>. Cliquez sur le lien qu’il contient pour
        confirmer votre adresse et vous connecter (lien valable 24 heures).
      </p>
      <p>Rien reçu ? Vérifiez vos courriers indésirables, ou connectez-vous puis demandez un nouvel e-mail.</p>
      <p>
        <Link href="/login" className="font-medium text-primary hover:underline">
          Aller à la connexion
        </Link>
      </p>
    </Notice>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, initialAuthFormState);
  return (
    <form action={action} noValidate className="flex flex-col gap-4" aria-labelledby="auth-title">
      <input type="hidden" name="next" value={next} />
      <FormError message={state.error} />
      <Field
        label="Adresse e-mail"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        autoFocus
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <p className="-mt-2 text-right text-sm">
        <Link href="/forgot-password" className="font-medium text-primary hover:underline">
          Mot de passe oublié ?
        </Link>
      </p>
      <FormActions label="Se connecter" pendingLabel="Connexion…" />
    </form>
  );
}

export function SignupForm({ next }: { next: string }) {
  const [state, action] = useActionState(signupAction, initialAuthFormState);
  if (state.done) return <CheckYourInbox email={state.values?.email} />;
  return (
    <form action={action} noValidate className="flex flex-col gap-4" aria-labelledby="auth-title">
      <input type="hidden" name="next" value={next} />
      <FormError message={state.error} />
      <Field label="Nom" name="name" autoComplete="name" required autoFocus defaultValue={state.values?.name} error={state.fieldErrors?.name} />
      <Field
        label="Adresse e-mail"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint={PASSWORD_HINT}
        error={state.fieldErrors?.password}
      />
      <FormActions label="Créer mon compte" pendingLabel="Création…" />
    </form>
  );
}

/** Inscription studio. Si `signedInAs` est fourni, l'utilisateur est déjà connecté : seul le nom du studio est demandé. */
export function StudioSignupForm({ next, signedInAs }: { next: string; signedInAs?: string }) {
  const [state, action] = useActionState(studioSignupAction, initialAuthFormState);
  if (state.done) return <CheckYourInbox email={state.values?.email} />;
  return (
    <form action={action} noValidate className="flex flex-col gap-4" aria-labelledby="auth-title">
      <input type="hidden" name="next" value={next} />
      <FormError message={state.error} />
      <Field
        label="Nom du studio"
        name="studioName"
        autoComplete="organization"
        required
        autoFocus
        defaultValue={state.values?.studioName}
        hint="Affiché sur vos jeux. Vous pourrez le modifier plus tard."
        error={state.fieldErrors?.studioName}
      />
      {signedInAs ? (
        <p className="text-sm text-ink-2">
          Le studio sera rattaché à votre compte <strong className="text-ink">{signedInAs}</strong>.
        </p>
      ) : (
        <>
          <Field label="Votre nom" name="name" autoComplete="name" required defaultValue={state.values?.name} error={state.fieldErrors?.name} />
          <Field
            label="Adresse e-mail professionnelle"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={state.values?.email}
            error={state.fieldErrors?.email}
          />
          <Field
            label="Mot de passe"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            hint={PASSWORD_HINT}
            error={state.fieldErrors?.password}
          />
        </>
      )}
      <FormActions label="Créer le studio" pendingLabel="Création…" />
    </form>
  );
}

/** « Mot de passe oublié ? » : réponse neutre, que le compte existe ou non. */
export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialAuthFormState);
  if (state.done) {
    return (
      <Notice title="Demande envoyée">
        <p>
          Si un compte existe pour <strong className="text-ink">{state.values?.email}</strong>, vous allez recevoir un e-mail avec un lien pour
          choisir un nouveau mot de passe. Ce lien est valable 1 heure et ne fonctionne qu’une fois.
        </p>
        <p>
          <Link href="/login" className="font-medium text-primary hover:underline">
            Retour à la connexion
          </Link>
        </p>
      </Notice>
    );
  }
  return (
    <form action={action} noValidate className="flex flex-col gap-4" aria-labelledby="auth-title">
      <FormError message={state.error} />
      <Field
        label="Adresse e-mail"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        autoFocus
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <FormActions label="Recevoir le lien" pendingLabel="Envoi…" cancelHref="/login" />
    </form>
  );
}

/** Nouveau mot de passe (le jeton vient du lien reçu par e-mail). */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initialAuthFormState);
  return (
    <form action={action} noValidate className="flex flex-col gap-4" aria-labelledby="auth-title">
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} />
      <Field
        label="Nouveau mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        autoFocus
        minLength={8}
        hint={PASSWORD_HINT}
        error={state.fieldErrors?.password}
      />
      <Field
        label="Confirmez le mot de passe"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        error={state.fieldErrors?.confirmPassword}
      />
      <FormActions label="Changer le mot de passe" pendingLabel="Enregistrement…" cancelHref="/login" />
    </form>
  );
}

/** Bouton « Renvoyer l'e-mail » de vérification (limité : 1 par minute, 5 par heure). */
export function ResendVerificationForm({ compact = false }: { compact?: boolean }) {
  const [state, action] = useActionState(resendVerificationAction, initialAuthFormState);
  return (
    <form action={action} className={compact ? 'inline-flex flex-wrap items-center gap-2' : 'flex flex-col gap-3'}>
      {state.done ? (
        <p role="status" className="text-sm text-ink-2">
          E-mail envoyé. Pensez à vérifier vos courriers indésirables.
        </p>
      ) : (
        <ResendButton />
      )}
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center rounded-[var(--radius)] border border-line bg-surface px-3 text-sm font-semibold text-ink transition hover:bg-black/5 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? 'Envoi…' : 'Renvoyer l’e-mail'}
    </button>
  );
}
