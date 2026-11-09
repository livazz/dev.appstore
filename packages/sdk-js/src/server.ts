/*
 * Outils serveur (Node ≥ 20) : vérification des webhooks Dev AppStore.
 * Import séparé (`@devappstore/sdk/server`) pour que le bundle navigateur n'embarque pas `node:crypto`.
 *
 * En-tête : `DevAppStore-Signature: t=<unix>,v1=<hex>` où v1 = HMAC-SHA256(secret, `${t}.${corps brut}`).
 *
 * Événements reçus : `purchase.completed` (créditer) et `purchase.refunded` (révoquer l'achat `order_id` s'il avait été
 * crédité, sinon ignorer). Idempotence obligatoire sur `delivery_id` (un même événement peut être renvoyé).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PurchaseEvent } from './types.js';

export const SIGNATURE_HEADER = 'DevAppStore-Signature';
export const DEFAULT_TOLERANCE_S = 300;

export interface VerifyOptions {
  /** Écart maximal accepté entre `t` et l'horloge locale (défaut 300 s, protège du rejeu). */
  toleranceSec?: number;
  /** Heure courante en secondes Unix (tests). */
  now?: number;
}

const toText = (body: string | Uint8Array) => (typeof body === 'string' ? body : Buffer.from(body).toString('utf8'));

/** Calcule un en-tête `DevAppStore-Signature` (utile pour tester son endpoint). */
export function signWebhookPayload(body: string | Uint8Array, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${toText(body)}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/**
 * Vérifie l'en-tête `DevAppStore-Signature` d'un webhook (ou d'un appel « player lookup », dont le corps signé
 * est l'ID joueur brut). Passez le corps **brut**, tel que reçu, avant tout `JSON.parse`.
 */
export function verifyWebhookSignature(body: string | Uint8Array, header: string | null | undefined, secret: string, options: VerifyOptions = {}): boolean {
  if (!header || !secret) return false;
  const parts: Record<string, string[]> = {};
  for (const p of header.split(',')) {
    const i = p.indexOf('=');
    if (i <= 0) continue;
    const k = p.slice(0, i).trim();
    (parts[k] ??= []).push(p.slice(i + 1).trim());
  }
  const t = Number(parts.t?.[0]);
  const candidates = parts.v1 ?? [];
  if (!Number.isInteger(t) || t <= 0 || candidates.length === 0) return false;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (options.toleranceSec ?? DEFAULT_TOLERANCE_S)) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${toText(body)}`).digest('hex'));
  // Plusieurs v1 possibles (rotation de secret) : un seul doit correspondre.
  return candidates.some((v) => {
    const got = Buffer.from(v);
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

export class WebhookSignatureError extends Error {
  constructor() {
    super('Signature Dev AppStore invalide ou expirée.');
    this.name = 'WebhookSignatureError';
  }
}

/** Vérifie la signature puis renvoie l'événement. Lève `WebhookSignatureError` si la signature est invalide. */
export function constructWebhookEvent(body: string | Uint8Array, header: string | null | undefined, secret: string, options?: VerifyOptions): PurchaseEvent {
  if (!verifyWebhookSignature(body, header, secret, options)) throw new WebhookSignatureError();
  return JSON.parse(toText(body)) as PurchaseEvent;
}

export type { PurchaseEvent } from './types.js';
