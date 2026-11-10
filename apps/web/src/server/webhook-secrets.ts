import 'server-only';
import { randomToken } from '@devappstore/core';
import { and, db, eq, games } from '@devappstore/db';
import { SecretDecryptError, decryptSecret, deriveKey, encryptSecret, rootSecret } from './secrets';

/*
 * Secret de signature des webhooks (et des appels « player lookup ») — revue de sécurité 2026-11, F7.
 *
 * - Chiffré au repos : AES-256-GCM (`./secrets`, aucune dépendance), clé dérivée par HKDF du secret de l'application
 *   (BETTER_AUTH_SECRET) avec un `info` propre à cet usage, données associées = id du jeu (une valeur recopiée sur un
 *   autre jeu ne se déchiffre pas). Format stocké : `enc:v1:<iv>:<tag>:<texte chiffré>` (base64).
 *   Les valeurs historiques en clair (`whsec_…`, jeux créés avant ce changement, seed) restent lues telles quelles et
 *   sont chiffrées à la première utilisation (`loadWebhookSecrets`).
 * - Rotation avec période de recouvrement : l'ancien secret reste utilisé pour signer pendant
 *   WEBHOOK_SECRET_OVERLAP_MS (deux `v1=` dans l'en-tête), le temps que le studio déploie le nouveau.
 * - ATTENTION : changer BETTER_AUTH_SECRET rend les secrets chiffrés illisibles (`SecretDecryptError`) : les envois
 *   échouent avec un message explicite et le studio doit régénérer son secret webhook.
 */

export const WEBHOOK_SECRET_INFO = 'devappstore/webhook-secret/v1';
const PREFIX = 'enc:v1:';
/** Durée pendant laquelle l'ancien secret signe encore, après une rotation. */
export const WEBHOOK_SECRET_OVERLAP_MS = 24 * 3600_000;

export interface WebhookSecrets {
  /** Secret courant (clair). */
  current: string;
  /** Secrets encore acceptés pendant la période de recouvrement (clairs). */
  previous: string[];
}

const keyFor = (key?: Buffer) => key ?? deriveKey(rootSecret(), WEBHOOK_SECRET_INFO);

export const isSealed = (stored: string) => stored.startsWith(PREFIX);

/** Chiffre un secret pour le jeu `gameId`. */
export function sealWebhookSecret(gameId: string, plaintext: string, key?: Buffer): string {
  const e = encryptSecret(plaintext, { aad: gameId, key: keyFor(key) });
  return `${PREFIX}${e.iv}:${e.tag}:${e.ciphertext}`;
}

/** Déchiffre une valeur stockée (les valeurs historiques en clair sont renvoyées telles quelles). */
export function openWebhookSecret(gameId: string, stored: string, key?: Buffer): string {
  if (!isSealed(stored)) return stored;
  const [iv, tag, ciphertext] = stored.slice(PREFIX.length).split(':');
  if (!iv || !tag || ciphertext === undefined) throw new SecretDecryptError('Format de secret chiffré invalide.');
  return decryptSecret({ iv, tag, ciphertext }, { aad: gameId, key: keyFor(key) });
}

export function newWebhookSecret() {
  return randomToken('whsec_');
}

type SecretRow = {
  id: string;
  webhookSecret: string;
  webhookSecretPrevious: string | null;
  webhookSecretPreviousExpiresAt: Date | null;
};

/** Secrets utilisables d'une ligne `games` (sans accès base). */
export function secretsOf(row: SecretRow, now = new Date()): WebhookSecrets {
  const current = openWebhookSecret(row.id, row.webhookSecret);
  const previous: string[] = [];
  if (row.webhookSecretPrevious && row.webhookSecretPreviousExpiresAt && row.webhookSecretPreviousExpiresAt.getTime() > now.getTime()) {
    try {
      previous.push(openWebhookSecret(row.id, row.webhookSecretPrevious));
    } catch {
      /* ancien secret illisible : seul le courant signe */
    }
  }
  return { current, previous };
}

/**
 * Secrets du jeu (courant + anciens encore valides), ou null si le jeu n'existe pas. Chiffre au passage un secret
 * historique stocké en clair. Lève SecretDecryptError si le secret courant est illisible.
 */
export async function loadWebhookSecrets(gameId: string, now = new Date()): Promise<WebhookSecrets | null> {
  const [row] = await db
    .select({
      id: games.id,
      webhookSecret: games.webhookSecret,
      webhookSecretPrevious: games.webhookSecretPrevious,
      webhookSecretPreviousExpiresAt: games.webhookSecretPreviousExpiresAt,
    })
    .from(games)
    .where(eq(games.id, gameId));
  if (!row) return null;
  const secrets = secretsOf(row, now);
  if (!isSealed(row.webhookSecret)) {
    await db
      .update(games)
      .set({ webhookSecret: sealWebhookSecret(row.id, secrets.current) })
      .where(and(eq(games.id, row.id), eq(games.webhookSecret, row.webhookSecret)));
  }
  return secrets;
}

/** Tous les secrets qui signent un envoi, le courant en premier. */
export const signingSecrets = (s: WebhookSecrets) => [s.current, ...s.previous];

/**
 * Nouveau secret : l'ancien continue de signer pendant `overlapMs` (0 = coupure immédiate, après une fuite).
 * Renvoie le nouveau secret en clair (affiché une fois au studio), ou null si le jeu n'existe pas.
 */
export async function rotateWebhookSecret(gameId: string, opts: { now?: Date; overlapMs?: number } = {}): Promise<string | null> {
  const now = opts.now ?? new Date();
  const overlapMs = opts.overlapMs ?? WEBHOOK_SECRET_OVERLAP_MS;
  const [row] = await db.select({ id: games.id, webhookSecret: games.webhookSecret }).from(games).where(eq(games.id, gameId));
  if (!row) return null;
  let previous: string | null = null;
  try {
    previous = overlapMs > 0 ? sealWebhookSecret(gameId, openWebhookSecret(gameId, row.webhookSecret)) : null;
  } catch {
    previous = null; // ancien secret illisible : rien à conserver
  }
  const secret = newWebhookSecret();
  await db
    .update(games)
    .set({
      webhookSecret: sealWebhookSecret(gameId, secret),
      webhookSecretPrevious: previous,
      webhookSecretPreviousExpiresAt: previous ? new Date(now.getTime() + overlapMs) : null,
      updatedAt: now,
    })
    .where(eq(games.id, gameId));
  return secret;
}
