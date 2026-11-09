import 'server-only';
import Stripe from 'stripe';
import { env } from '@/env';

/*
 * Configuration Stripe (tâche « payments »).
 *
 * - STRIPE_SECRET_KEY défini → vrais paiements (Stripe Checkout + Connect).
 * - STRIPE_SECRET_KEY vide → MODE SIMULATION (/checkout/mock), **impossible en production** :
 *   en NODE_ENV=production, l'absence de clé rend le paiement indisponible (503), jamais gratuit.
 * - En production, une clé de test (sk_test_ / rk_test_) est refusée, sauf DEVAPPSTORE_ALLOW_TEST_PAYMENTS=1
 *   (préproduction explicite). Sans ce drapeau, les événements webhook `livemode: false` sont aussi ignorés.
 *
 * Modèle de charge (choix TVA non tranché — NE PAS changer le défaut sans décision du fondateur) :
 * - CHARGE_MODEL=destination (défaut) : la session Checkout est créée sur le compte plateforme, l'argent est
 *   transféré au compte Connect du studio (`transfer_data.destination`) moins `application_fee_amount`.
 *   Dev AppStore apparaît sur le relevé et porte les litiges en premier.
 * - CHARGE_MODEL=direct : la session est créée SUR le compte Connect du studio (en-tête `Stripe-Account`),
 *   Dev AppStore prélève `application_fee_amount`. Le studio est le marchand (relevé, litiges, TVA à sa charge).
 * - STRIPE_AUTOMATIC_TAX=1 active Stripe Tax (`automatic_tax.enabled`) : désactivé par défaut. À n'activer
 *   qu'après la décision TVA (docs/legal/tax.md) et la configuration de Stripe Tax sur le compte qui encaisse
 *   (plateforme en destination, studio en direct). Le prix est alors traité TTC (`tax_behavior: inclusive`) :
 *   le montant payé reste égal au prix affiché « Payer X € » et au montant contrôlé par le webhook.
 *
 * Autres variables : DEVAPPSTORE_CGV_VERSION (version des CGV acceptées, stockée sur la commande),
 * APP_URL (obligatoire en production : origine des URL de retour Stripe, jamais l'en-tête Host).
 * Toutes les variables sont lues dans `env` (src/env.ts, validé au démarrage par instrumentation.ts).
 */

export const STRIPE_API_VERSION = '2025-08-27.basil' satisfies Stripe.LatestApiVersion;

/** Tolérance (secondes) sur l'horodatage de `Stripe-Signature` : au-delà, l'événement est refusé (anti-rejeu). */
export const STRIPE_WEBHOOK_TOLERANCE_S = 300;

export function stripeSecretKey(): string | null {
  return env.STRIPE_SECRET_KEY ?? null;
}

export function isStripeEnabled(): boolean {
  return stripeSecretKey() !== null;
}

export function isProduction(): boolean {
  return env.isProduction;
}

/** Clé de test explicitement autorisée en production (préproduction). */
export function testPaymentsAllowed(): boolean {
  return env.DEVAPPSTORE_ALLOW_TEST_PAYMENTS === '1';
}

const isTestKey = (key: string) => /^(sk|rk)_test_/.test(key);

export type PaymentsConfigProblem = 'missing_key' | 'test_key_in_production';

/**
 * Problème de configuration qui interdit d'encaisser, ou null si la configuration est utilisable.
 * Hors production, l'absence de clé n'est pas un problème (mode simulation).
 */
export function paymentsConfigProblem(): PaymentsConfigProblem | null {
  if (!isProduction()) return null;
  const key = stripeSecretKey();
  if (!key) return 'missing_key';
  if (isTestKey(key) && !testPaymentsAllowed()) return 'test_key_in_production';
  return null;
}

/** Message explicite (journaux / opérateurs) pour un problème de configuration. */
export function paymentsConfigMessage(problem: PaymentsConfigProblem): string {
  return problem === 'missing_key'
    ? 'STRIPE_SECRET_KEY manquant en production : paiements désactivés (le mode simulation est interdit en production).'
    : 'Clé Stripe de test en production : paiements désactivés (définir une clé sk_live_ ou DEVAPPSTORE_ALLOW_TEST_PAYMENTS=1 en préproduction).';
}

/** Le mode simulation n'est possible que sans clé Stripe et hors production. */
export function isSimulationAllowed(): boolean {
  return !isStripeEnabled() && !isProduction();
}

/** En production sans drapeau de préproduction, les événements Stripe du mode test sont ignorés. */
export function acceptsTestModeEvents(): boolean {
  return !isProduction() || testPaymentsAllowed();
}

let cached: { key: string; client: Stripe } | null = null;

/** Client Stripe (lève une erreur si STRIPE_SECRET_KEY est vide ou refusée en production). */
export function getStripe(): Stripe {
  const key = stripeSecretKey();
  if (!key) throw new Error('STRIPE_SECRET_KEY non défini : Stripe est désactivé (mode simulation).');
  const problem = paymentsConfigProblem();
  if (problem) throw new Error(paymentsConfigMessage(problem));
  if (!cached || cached.key !== key) {
    cached = {
      key,
      client: new Stripe(key, { apiVersion: STRIPE_API_VERSION, appInfo: { name: 'Dev AppStore' }, maxNetworkRetries: 2 }),
    };
  }
  return cached.client;
}

// ---------------------------------------------------------------------------------------------
// Modèle de charge et TVA
// ---------------------------------------------------------------------------------------------

export type ChargeModel = 'destination' | 'direct';

/** CHARGE_MODEL=destination|direct (défaut destination ; valeur inconnue → destination + avertissement). */
export function chargeModel(raw: string | undefined = env.CHARGE_MODEL): ChargeModel {
  const v = raw?.trim().toLowerCase();
  if (!v || v === 'destination') return 'destination';
  if (v === 'direct') return 'direct';
  console.warn(`[stripe] CHARGE_MODEL invalide (« ${v} ») : « destination » utilisé.`);
  return 'destination';
}

/** STRIPE_AUTOMATIC_TAX=1 → Stripe Tax activé sur les sessions Checkout. Désactivé par défaut (choix TVA non tranché). */
export function automaticTaxEnabled(raw: string | undefined = env.STRIPE_AUTOMATIC_TAX): boolean {
  return raw?.trim() === '1';
}

// ---------------------------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------------------------

/**
 * Secrets de signature des webhooks. STRIPE_WEBHOOK_SECRET (compte plateforme) et, optionnellement,
 * STRIPE_CONNECT_WEBHOOK_SECRET (endpoint « comptes connectés », pour account.updated et les charges directes).
 */
export function webhookSecrets(): string[] {
  return [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_CONNECT_WEBHOOK_SECRET]
    .map((s) => s?.trim() ?? '')
    .filter((s) => s.length > 0);
}

/**
 * Vérifie la signature `Stripe-Signature` sur le corps BRUT (chaîne exacte reçue, jamais un JSON re-sérialisé)
 * avec une tolérance d'horodatage de STRIPE_WEBHOOK_TOLERANCE_S, et renvoie l'événement ou null.
 * N'a pas besoin de STRIPE_SECRET_KEY.
 */
export function verifyStripeEvent(
  payload: string,
  signature: string | null,
  secrets = webhookSecrets(),
  toleranceS = STRIPE_WEBHOOK_TOLERANCE_S,
): Stripe.Event | null {
  if (!signature || typeof payload !== 'string') return null;
  for (const secret of secrets) {
    try {
      return Stripe.webhooks.constructEvent(payload, signature, secret, toleranceS);
    } catch {
      // essaie le secret suivant
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Origine publique
// ---------------------------------------------------------------------------------------------

/**
 * Origine publique du site pour les URL de retour Stripe. APP_URL est prioritaire (évite l'injection d'en-tête
 * Host) et OBLIGATOIRE en production ; hors production, repli sur l'origine de la requête ou ses en-têtes.
 */
export async function appOrigin(req?: Request): Promise<string> {
  const fromEnv = env.APP_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (isProduction()) throw new Error('APP_URL doit être défini en production (URL de retour Stripe).');
  if (req) return new URL(req.url).origin;
  const { headers } = await import('next/headers');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}
