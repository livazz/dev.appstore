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
    preheader: 'Un clic pour activer votre compte Wolleen.',
    reason: 'Vous recevez cet e-mail car cette adresse a été utilisée pour créer un compte Wolleen.',
    blocks: [
      heading('Confirmez votre adresse e-mail'),
      para(data.name ? `Bonjour ${data.name},` : 'Bonjour,'),
      para(`Pour activer votre compte Wolleen, confirmez votre adresse e-mail en cliquant sur le bouton ci-dessous.${validity(data.expiresInMinutes)}`),
      button('Confirmer mon adresse', data.url),
      para('Vous n’êtes pas à l’origine de cette inscription ? Ignorez simplement ce message : aucun compte ne sera activé.', { muted: true }),
    ],
  });
}

export function passwordResetEmail(data: AuthLinkData, context?: Partial<EmailContext>): EmailContent {
  const ctx = resolveContext(context);
  return renderEmail({
    ctx,
    subject: 'Réinitialisation de votre mot de passe Wolleen',
    preheader: 'Choisissez un nouveau mot de passe pour votre compte.',
    reason: 'Vous recevez cet e-mail car une réinitialisation de mot de passe a été demandée pour votre compte Wolleen.',
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
