import 'server-only';
import { db, eq, user, type DB } from '@devappstore/db';

/*
 * Revue de sécurité A-04 — e-mail vérifié exigé pour les actions qui engagent de l'argent, un compte de jeu ou un studio.
 *
 * Politique (docs/security/revue-2026-11/auth-autorisation.md, A-04) :
 * - connexion et navigation possibles sans vérification (bandeau d'invitation, bouton « Renvoyer l'e-mail ») ;
 * - e-mail vérifié exigé pour : l'achat (createCheckout), la liaison d'un compte de jeu (actions /games/[slug]/link),
 *   la création d'un studio par un compte existant, la création et la publication d'un jeu, les rotations de clés et
 *   secrets d'intégration (et le changement d'URL de webhook), les versements (Stripe Connect) ;
 * - comptes Google / Apple : vérifiés d'office (auth.ts) ; comptes du seed : vérifiés (packages/db/src/seed.ts).
 *
 * La valeur est toujours relue en base (jamais depuis un cache de session) : une vérification faite dans un autre
 * onglet est prise en compte immédiatement.
 */

export const VERIFY_EMAIL_PATH = '/verify-email';

export const EMAIL_NOT_VERIFIED_CODE = 'email_not_verified';

/** Message affiché quand une action exige une adresse vérifiée. */
export function emailNotVerifiedMessage(action?: string): string {
  return `Confirmez votre adresse e-mail${action ? ` ${action}` : ''} : cliquez sur le lien reçu par e-mail, ou demandez-en un nouveau.`;
}

export class EmailNotVerifiedError extends Error {
  readonly code = EMAIL_NOT_VERIFIED_CODE;
  constructor(action?: string) {
    super(emailNotVerifiedMessage(action));
    this.name = 'EmailNotVerifiedError';
  }
}

/** Vrai si l'adresse du compte est vérifiée (compte inconnu → faux). */
export async function isEmailVerified(userId: string, database: DB = db): Promise<boolean> {
  if (!userId) return false;
  const [row] = await database.select({ v: user.emailVerified }).from(user).where(eq(user.id, userId)).limit(1);
  return row?.v === true;
}

/** Lève EmailNotVerifiedError si l'adresse du compte n'est pas vérifiée. `action` : « pour acheter », etc. */
export async function assertEmailVerified(userId: string, action?: string, database: DB = db): Promise<void> {
  if (!(await isEmailVerified(userId, database))) throw new EmailNotVerifiedError(action);
}
