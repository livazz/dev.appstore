import 'server-only';
import Stripe from 'stripe';

/*
 * Configuration Stripe (tâche « payments »).
 * - STRIPE_SECRET_KEY défini → vrais paiements (Stripe Checkout + Connect).
 * - STRIPE_SECRET_KEY vide → MODE SIMULATION (/checkout/mock), interdit en production.
 */

export const STRIPE_API_VERSION = '2025-08-27.basil' satisfies Stripe.LatestApiVersion;

export function stripeSecretKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key ? key : null;
}

export function isStripeEnabled(): boolean {
  return stripeSecretKey() !== null;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Le mode simulation n'est possible que sans clé Stripe et hors production. */
export function isSimulationAllowed(): boolean {
  return !isStripeEnabled() && !isProduction();
}

let cached: { key: string; client: Stripe } | null = null;

/** Client Stripe (lève une erreur si STRIPE_SECRET_KEY est vide). */
export function getStripe(): Stripe {
  const key = stripeSecretKey();
  if (!key) throw new Error('STRIPE_SECRET_KEY non défini : Stripe est désactivé (mode simulation).');
  if (!cached || cached.key !== key) {
    cached = {
      key,
      client: new Stripe(key, { apiVersion: STRIPE_API_VERSION, appInfo: { name: 'Wolleen' }, maxNetworkRetries: 2 }),
    };
  }
  return cached.client;
}

/**
 * Secrets de signature des webhooks. STRIPE_WEBHOOK_SECRET (compte plateforme) et, optionnellement,
 * STRIPE_CONNECT_WEBHOOK_SECRET (endpoint « comptes connectés », pour account.updated).
 */
export function webhookSecrets(): string[] {
  return [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET]
    .map((s) => s?.trim() ?? '')
    .filter((s) => s.length > 0);
}

/**
 * Vérifie la signature `Stripe-Signature` et renvoie l'événement, ou null si elle est absente/invalide.
 * N'a pas besoin de STRIPE_SECRET_KEY.
 */
export function verifyStripeEvent(payload: string, signature: string | null, secrets = webhookSecrets()): Stripe.Event | null {
  if (!signature) return null;
  for (const secret of secrets) {
    try {
      return Stripe.webhooks.constructEvent(payload, signature, secret);
    } catch {
      // essaie le secret suivant
    }
  }
  return null;
}

/**
 * Origine publique du site pour les URL de retour Stripe. APP_URL est prioritaire (évite l'injection
 * d'en-tête Host) ; sinon l'origine de la requête, ou les en-têtes de la requête en cours (server actions).
 */
export async function appOrigin(req?: Request): Promise<string> {
  const fromEnv = process.env.APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (req) return new URL(req.url).origin;
  const { headers } = await import('next/headers');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}
