import { createPrivateKey, sign, type KeyObject } from 'node:crypto';

export type JwtAlg = 'ES256' | 'RS256';

export function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * Normalise une clé privée PEM : accepte les `\n` littéraux (variables d'environnement, JSON)
 * et une clé .p8 Apple collée sans en-têtes.
 */
export function normalizePem(pem: string): string {
  let s = pem.trim().replace(/\\n/g, '\n');
  if (!s.includes('-----BEGIN')) {
    const body = s.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') ?? '';
    s = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
  }
  return s;
}

export function loadPrivateKey(pem: string | KeyObject): KeyObject {
  return typeof pem === 'string' ? createPrivateKey(normalizePem(pem)) : pem;
}

/**
 * Signe un JWT compact (JWS) avec node:crypto, sans dépendance.
 * ES256 : signature au format IEEE P1363 (r‖s, 64 octets) exigé par la RFC 7518, pas DER.
 */
export function signJwt(
  alg: JwtAlg,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: string | KeyObject,
): string {
  const key = loadPrivateKey(privateKey);
  const signingInput = `${base64url(JSON.stringify({ ...header, alg }))}.${base64url(JSON.stringify(payload))}`;
  const signature =
    alg === 'ES256'
      ? sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' })
      : sign('sha256', Buffer.from(signingInput), key);
  return `${signingInput}.${base64url(signature)}`;
}

/** Décode (sans vérifier) l'en-tête et la charge utile d'un JWT. Pratique pour les tests et le débogage. */
export function decodeJwt(token: string): { header: Record<string, unknown>; payload: Record<string, unknown> } {
  const [h, p] = token.split('.');
  if (!h || !p) throw new Error('JWT invalide');
  return {
    header: JSON.parse(Buffer.from(h, 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(p, 'base64url').toString('utf8')),
  };
}
