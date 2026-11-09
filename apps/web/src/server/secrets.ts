import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/*
 * Chiffrement des secrets au repos (identifiants App Store Connect / Google Play des studios).
 *
 * AES-256-GCM, IV aléatoire de 12 octets, tag de 16 octets. La clé est dérivée du secret de l'application
 * (BETTER_AUTH_SECRET, sinon AUTH_SECRET — le même que Better Auth) par HKDF-SHA256 avec un `info` propre à l'usage :
 * changer d'usage (ou de version) donne une autre clé, et le secret d'authentification n'est jamais utilisé tel quel.
 * Les données associées (`aad`, ex. « gam_x:app_store ») lient le texte chiffré à son contexte : une ligne recopiée
 * ailleurs ne se déchiffre pas.
 *
 * Rotation du secret : les identifiants chiffrés avec l'ancien secret deviennent illisibles (`SecretDecryptError`),
 * le studio doit simplement les saisir de nouveau.
 */

export interface EncryptedSecret {
  /** base64 */
  ciphertext: string;
  /** base64, 12 octets */
  iv: string;
  /** base64, 16 octets */
  tag: string;
}

export class SecretDecryptError extends Error {
  constructor(message = 'Secret indéchiffrable (clé changée ou données altérées).') {
    super(message);
    this.name = 'SecretDecryptError';
  }
}

const DEV_SECRET = 'wolleen-dev-secret-ne-pas-utiliser-en-production-0123456789';
const SALT = 'wolleen/secrets';
export const STORE_CREDENTIALS_INFO = 'wolleen/store-credentials/v1';

/** Secret racine : le même que Better Auth (cf. server/auth.ts), avec le même repli de développement. */
export function rootSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.BETTER_AUTH_SECRET || env.AUTH_SECRET;
  if (secret) return secret;
  if (env.NODE_ENV === 'production' && env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error('BETTER_AUTH_SECRET (ou AUTH_SECRET) est requis en production pour chiffrer les identifiants des stores.');
  }
  return DEV_SECRET;
}

/** Clé AES-256 dérivée par HKDF-SHA256(secret, sel fixe, info). */
export function deriveKey(secret: string, info: string = STORE_CREDENTIALS_INFO): Buffer {
  if (!secret) throw new Error('Secret racine vide.');
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.from(SALT, 'utf8'), Buffer.from(info, 'utf8'), 32));
}

export interface SecretOptions {
  /** Données associées authentifiées (non chiffrées), ex. `${gameId}:${source}`. */
  aad?: string;
  /** Clé déjà dérivée (tests) ; défaut : deriveKey(rootSecret()). */
  key?: Buffer;
}

function keyOf(opts: SecretOptions) {
  const key = opts.key ?? deriveKey(rootSecret());
  if (key.length !== 32) throw new Error('La clé AES-256 doit faire 32 octets.');
  return key;
}

export function encryptSecret(plaintext: string, opts: SecretOptions = {}): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOf(opts), iv);
  if (opts.aad) cipher.setAAD(Buffer.from(opts.aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

export function decryptSecret(enc: EncryptedSecret, opts: SecretOptions = {}): string {
  const iv = Buffer.from(enc.iv, 'base64');
  const tag = Buffer.from(enc.tag, 'base64');
  if (iv.length !== 12 || tag.length !== 16) throw new SecretDecryptError('IV ou tag invalide.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyOf(opts), iv, { authTagLength: 16 });
    if (opts.aad) decipher.setAAD(Buffer.from(opts.aad, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(enc.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new SecretDecryptError();
  }
}

/** Raccourcis JSON. */
export function encryptJson(value: unknown, opts: SecretOptions = {}): EncryptedSecret {
  return encryptSecret(JSON.stringify(value), opts);
}
export function decryptJson<T>(enc: EncryptedSecret, opts: SecretOptions = {}): T {
  return JSON.parse(decryptSecret(enc, opts)) as T;
}
