/** État renvoyé par les Server Actions d'authentification aux formulaires (useActionState). */
export interface AuthFormState {
  error?: string;
  fieldErrors?: Partial<Record<'name' | 'email' | 'password' | 'studioName', string>>;
  /** Valeurs à réafficher après une erreur (jamais le mot de passe). */
  values?: { name?: string; email?: string; studioName?: string };
}

export const initialAuthFormState: AuthFormState = {};
