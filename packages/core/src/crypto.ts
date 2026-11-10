import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** En-tête : `DevAppStore-Signature: t=<unix>,v1=<hex>` — HMAC-SHA256 de `${t}.${body}`. */
export const SIGNATURE_HEADER = 'DevAppStore-Signature';
export const SIGNATURE_TOLERANCE_S = 300;

export function signPayload(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/**
 * Vérifie un en-tête `t=…,v1=…[,v1=…]` (temps constant, tolérance SIGNATURE_TOLERANCE_S). Plusieurs `v1` sont
 * acceptés (rotation du secret avec période de recouvrement) : un seul doit correspondre.
 */
export function verifySignature(body: string, header: string | null | undefined, secret: string, now = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  let t = 0;
  const candidates: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't' && !t) t = Number(v);
    else if (k === 'v1') candidates.push(v);
  }
  if (!Number.isInteger(t) || t <= 0 || !candidates.length || Math.abs(now - t) > SIGNATURE_TOLERANCE_S) return false;
  const a = Buffer.from(createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'));
  return candidates.some((v) => {
    const b = Buffer.from(v);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

/**
 * En-tête signé par plusieurs secrets (rotation) : `t=…,v1=<nouveau>,v1=<ancien>`. Le premier secret est le courant.
 */
export function signPayloadMulti(body: string, secrets: string[], timestamp = Math.floor(Date.now() / 1000)) {
  const sigs = [...new Set(secrets.filter(Boolean))].map((s) => `v1=${createHmac('sha256', s).update(`${timestamp}.${body}`).digest('hex')}`);
  return `t=${timestamp},${sigs.join(',')}`;
}

/**
 * Appel « player lookup » : la chaîne signée est `devappstore-lookup-v1:<player_id>` (revue 2026-11, F5). Le préfixe
 * sépare ce domaine de celui des webhooks (dont le corps est toujours un objet JSON) : une signature de lookup
 * capturée ne peut jamais valoir signature de webhook, et inversement.
 */
export const LOOKUP_SIGNATURE_PREFIX = 'devappstore-lookup-v1:';
export const lookupSignedString = (playerId: string) => `${LOOKUP_SIGNATURE_PREFIX}${playerId}`;

export function signLookup(playerId: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  return signPayload(lookupSignedString(playerId), secret, timestamp);
}

export function verifyLookupSignature(playerId: string, header: string | null | undefined, secret: string, now = Math.floor(Date.now() / 1000)) {
  return verifySignature(lookupSignedString(playerId), header, secret, now);
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
