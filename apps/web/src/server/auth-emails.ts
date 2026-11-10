import 'server-only';
import {
  contextFromEnv,
  createConsoleMailer,
  createMailerFromEnv,
  existingAccountEmail,
  passwordChangedEmail,
  passwordResetEmail,
  resolveContext,
  sendEmail,
  verifyEmailEmail,
  type EmailContent,
  type EmailContext,
  type Mailer,
} from '@devappstore/emails';
import { runInBackground } from './notifications';

/*
 * E-mails d'authentification (revue de sécurité A-04 / A-07) : vérification d'adresse, réinitialisation du mot de passe,
 * notification de changement, « vous avez déjà un compte ». Envoyés par le transport commun (`createMailerFromEnv`) :
 * en local, transport console → texte dans le terminal du serveur et copie dans `.data/mails/*.txt` (dossier relatif au
 * cwd du serveur, `apps/web/.data/mails` avec `npm run dev`, ou `MAIL_CONSOLE_DIR`).
 *
 * Les envois partent en arrière-plan (`runInBackground`) : la réponse HTTP ne dépend ni du transport ni de l'existence
 * du compte (même durée de réponse, pas d'énumération par le temps). Les liens à jeton ne sont jamais journalisés ici.
 */

/** Validité du lien de vérification d'adresse (24 h). */
export const EMAIL_VERIFICATION_EXPIRES_IN_S = 24 * 60 * 60;
/** Validité du lien de réinitialisation du mot de passe (1 h). */
export const PASSWORD_RESET_EXPIRES_IN_S = 60 * 60;

/** Page de l'application vers laquelle le lien de vérification renvoie après traitement. */
export const VERIFY_EMAIL_CALLBACK = '/verify-email?done=1';

export interface AuthMailDeps {
  /** Transport (par défaut : `createMailerFromEnv`, muet sous vitest). */
  mailer?: Mailer;
  context?: Partial<EmailContext>;
  /** Exécution différée (par défaut `runInBackground`) ; les tests peuvent attendre la promesse. */
  defer?: (label: string, task: () => Promise<unknown>) => void;
}

let envMailer: Mailer | null = null;
function defaultMailer(): Mailer {
  return (envMailer ??= process.env.VITEST === 'true' ? createConsoleMailer({ dir: false, log: () => {} }) : createMailerFromEnv());
}

/** Destinataire d'un e-mail d'authentification. */
export interface AuthMailUser {
  email: string;
  name?: string | null;
}

export function createAuthMailer(deps: AuthMailDeps = {}) {
  const ctx = () => (deps.context ? resolveContext({ ...contextFromEnv(), ...deps.context }) : contextFromEnv());
  const defer = deps.defer ?? runInBackground;
  const send = (label: string, to: string, content: () => EmailContent) =>
    defer(label, async () => {
      await sendEmail(deps.mailer ?? defaultMailer(), to, content());
    });
  const appUrl = (path: string) => `${ctx().appUrl}${path}`;

  return {
    /**
     * Lien vers la route Better Auth `/api/auth/verify-email` (jeton signé, 24 h), construit sur l'URL publique — Better
     * Auth le rend relatif quand il ne connaît pas cette URL — avec la page de retour de l'application imposée.
     */
    verification(user: AuthMailUser, token: string) {
      const url = appUrl(`/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(VERIFY_EMAIL_CALLBACK)}`);
      send('e-mail de vérification', user.email, () =>
        verifyEmailEmail({ name: user.name ?? undefined, url, expiresInMinutes: EMAIL_VERIFICATION_EXPIRES_IN_S / 60 }, ctx()),
      );
    },
    /** Lien direct vers la page de nouveau mot de passe (le jeton est vérifié à l'envoi du formulaire). */
    passwordReset(user: AuthMailUser, token: string) {
      const url = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
      send('e-mail de réinitialisation', user.email, () =>
        passwordResetEmail({ name: user.name ?? undefined, url, expiresInMinutes: PASSWORD_RESET_EXPIRES_IN_S / 60 }, ctx()),
      );
    },
    passwordChanged(user: AuthMailUser) {
      send('notification de mot de passe modifié', user.email, () =>
        passwordChangedEmail({ name: user.name ?? undefined, resetUrl: appUrl('/forgot-password') }, ctx()),
      );
    },
    existingAccount(user: AuthMailUser) {
      send('e-mail « compte existant »', user.email, () =>
        existingAccountEmail({ name: user.name ?? undefined, loginUrl: appUrl('/login'), resetUrl: appUrl('/forgot-password') }, ctx()),
      );
    },
  };
}

export type AuthMailer = ReturnType<typeof createAuthMailer>;
