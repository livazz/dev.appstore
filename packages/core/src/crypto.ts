import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** En-tête : `DevAppStore-Signature: t=<unix>,v1=<hex>` — HMAC-SHA256 de `${t}.${body}`. */
export const SIGNATURE_HEADER = 'DevAppStore-Signature';
export const SIGNATURE_TOLERANCE_S = 300;

export function signPayload(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

export function verifySignature(body: string, header: string | null | undefined, secret: string, now = Math.floor(Date.now() / 1000)) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(now - t) > SIGNATURE_TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function randomToken(prefix: string, bytes = 24) {
  return prefix + randomBytes(bytes).toString('base64url');
}

/** Clé API : seule l'empreinte SHA-256 est stockée, le préfixe sert à l'affichage. */
export function hashApiKey(key: string) {
  return createHash('sha256').update(key).digest('hex');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I
/** Code de liaison lisible, ex. « K7QF-M2XA ». */
export function generateLinkCode() {
  const pick = () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  const s = Array.from({ length: 8 }, pick).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function normalizeLinkCode(input: string) {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : null;
}
