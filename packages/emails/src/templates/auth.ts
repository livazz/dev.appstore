/** E-mails d'authentification : vérification d'adresse, réinitialisation du mot de passe. */
import { resolveContext, type EmailContext } from '../context';
import { button, heading, para, renderEmail, type EmailContent } from '../layout';

export interface AuthLinkData {
  name?: string;
  /** Lien à usage unique (généré par Better Auth). */
  url: string;
  /** Durée de validité du lien, en minutes. */
  expiresInMinutes?: number;
}

function validity(minutes?: number) {
  if (!minutes) return '';
  if (minutes % 1440 === 0) return ` Ce lien est valable ${minutes / 1440 === 1 ? '24 heures' : `${minutes / 1440} jours`}.`;
  if (minutes % 60 === 0) return ` Ce lien est valable ${minutes / 60} heure${minutes / 60 > 1 ? 's' : ''}.`;
  return ` Ce lien est valable ${minutes} minutes.`;
}

export function verifyEmailEmail(data: AuthLinkData, context?: Partial<EmailContext>): EmailContent {
  const ctx = resolveContext(context);
  return renderEmail({
    ctx,
    subject: 'Confirmez votre adresse e-mail',
    preheader: 'Un clic pour activer votre compte Dev AppStore.',
    reason: 'Vous recevez cet e-mail car cette adresse a été utilisée pour créer un compte Dev AppStore.',
    blocks: [
      heading('Confirmez votre adresse e-mail'),
      para(data.name ? `Bonjour ${data.name},` : 'Bonjour,'),
      para(`Pour activer votre compte Dev AppStore, confirmez votre adresse e-mail en cliquant sur le bouton ci-dessous.${validity(data.expiresInMinutes)}`),
      button('Confirmer mon adresse', data.url),
      para('Vous n’êtes pas à l’origine de cette inscription ? Ignorez simplement ce message : aucun compte ne sera activé.', { muted: true }),
    ],
  });
}

export function passwordResetEmail(data: AuthLinkData, context?: Partial<EmailContext>): EmailContent {
  const ctx = resolveContext(context);
  return renderEmail({
    ctx,
    subject: 'Réinitialisation de votre mot de passe Dev AppStore',
    preheader: 'Choisissez un nouveau mot de passe pour votre compte.',
    reason: 'Vous recevez cet e-mail car une réinitialisation de mot de passe a été demandée pour votre compte Dev AppStore.',
    blocks: [
      heading('Réinitialisez votre mot de passe'),
      para(data.name ? `Bonjour ${data.name},` : 'Bonjour,'),
      para(`Une demande de réinitialisation du mot de passe a été faite pour votre compte. Cliquez sur le bouton pour en choisir un nouveau.${validity(data.expiresInMinutes)}`),
      button('Choisir un nouveau mot de passe', data.url),
      para(
        'Vous n’avez rien demandé ? Ignorez ce message : votre mot de passe actuel reste valable. Si vous recevez ces e-mails sans les avoir demandés, contactez le support.',
        { muted: true },
      ),
    ],
  });
}

export interface PasswordChangedData {
  name?: string;
  /** Lien vers « Mot de passe oublié ? » (si la modification n'est pas de la titulaire). */
  resetUrl: string;
}

/** Notification envoyée après une réinitialisation du mot de passe (toutes les sessions ont été fermées). */
export function passwordChangedEmail(data: PasswordChangedData, context?: Partial<EmailContext>): EmailContent {
  const ctx = resolveContext(context);
  return renderEmail({
    ctx,
    subject: 'Votre mot de passe Dev AppStore a été modifié',
    preheader: 'Toutes vos sessions ont été fermées par sécurité.',
    reason: 'Vous recevez cet e-mail car le mot de passe de votre compte Dev AppStore vient d’être modifié.',
    blocks: [
      heading('Mot de passe modifié'),
      para(data.name ? `Bonjour ${data.name},` : 'Bonjour,'),
      para('Le mot de passe de votre compte vient d’être réinitialisé. Par sécurité, vous avez été déconnecté de tous vos appareils.'),
      para('Si vous êtes à l’origine de ce changement, vous n’avez rien à faire.'),
      para('Ce n’était pas vous ? Choisissez immédiatement un nouveau mot de passe, puis contactez le support.'),
      button('Sécuriser mon compte', data.resetUrl),
    ],
  });
}

export interface ExistingAccountData {
  name?: string;
  /** Page de connexion. */
  loginUrl: string;
  /** Page « Mot de passe oublié ? ». */
  resetUrl: string;
}

/**
 * Inscription avec une adresse déjà enregistrée (revue A-07) : le formulaire répond comme pour une adresse libre et
 * c'est la titulaire, dans sa boîte mail, qui apprend qu'elle a déjà un compte.
 */
export function existingAccountEmail(data: ExistingAccountData, context?: Partial<EmailContext>): EmailContent {
  const ctx = resolveContext(context);
  return renderEmail({
    ctx,
    subject: 'Vous avez déjà un compte Dev AppStore',
    preheader: 'Connectez-vous ou réinitialisez votre mot de passe.',
    reason: 'Vous recevez cet e-mail car quelqu’un a essayé de créer un compte Dev AppStore avec cette adresse.',
    blocks: [
      heading('Vous avez déjà un compte'),
      para(data.name ? `Bonjour ${data.name},` : 'Bonjour,'),
      para('Une inscription vient d’être demandée avec cette adresse e-mail, mais un compte Dev AppStore existe déjà : aucun nouveau compte n’a été créé.'),
      button('Me connecter', data.loginUrl),
      para(['Mot de passe oublié ? ', { a: 'Choisissez-en un nouveau', href: data.resetUrl }, '.']),
      para('Vous n’êtes pas à l’origine de cette demande ? Ignorez ce message : votre compte n’a pas été modifié.', { muted: true }),
    ],
  });
}
