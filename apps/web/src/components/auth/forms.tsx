'use client';
import { useActionState } from 'react';
import { loginAction, signupAction, studioSignupAction } from './actions';
import { Field, FormActions, FormError } from './fields';
import { initialAuthFormState } from './form-state';

const PASSWORD_HINT = 'Au moins 8 caractères.';

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
      <FormActions label="Se connecter" pendingLabel="Connexion…" />
    </form>
  );
}

export function SignupForm({ next }: { next: string }) {
  const [state, action] = useActionState(signupAction, initialAuthFormState);
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
