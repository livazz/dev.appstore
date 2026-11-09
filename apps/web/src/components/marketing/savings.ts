/*
 * Logique pure du calculateur, importable côté client : PAS d'import de « @wolleen/core » ici, car son point
 * d'entrée unique réexporte crypto.ts (node:crypto), ce qui casse le bundle navigateur. Les taux
 * STORE_FEE_BPS / DEFAULT_PLATFORM_FEE_BPS sont passés en props depuis la page serveur.
 */

/** Commission arrondie au centime le plus proche (même règle que feeCents de @wolleen/core). */
function feeCents(amountCents: number, bps: number) {
  return Math.round((amountCents * bps) / 10_000);
}

export interface SavingsInput {
  /** Revenu brut mensuel des achats in-app, en centimes. */
  monthlyRevenueCents: number;
  /** Part des ventes basculées sur le web, en pourcentage (0-100). */
  webSharePct: number;
  /** Commission des stores (points de base), ex. STORE_FEE_BPS. */
  storeFeeBps: number;
  /** Commission Wolleen (points de base), ex. DEFAULT_PLATFORM_FEE_BPS. */
  platformFeeBps: number;
}

export interface SavingsResult {
  /** Volume annuel passé sur le web (centimes). */
  annualWebCents: number;
  /** Commission annuelle qu'auraient prise les stores sur ce volume (centimes). */
  annualStoreFeeCents: number;
  /** Commission annuelle Wolleen sur ce volume (centimes). */
  annualPlatformFeeCents: number;
  /** Gain annuel net pour le studio (centimes). */
  annualGainCents: number;
}

/** Estimation du gain annuel quand une part des achats in-app passe des stores au web via Wolleen. */
export function estimateSavings({
  monthlyRevenueCents,
  webSharePct,
  storeFeeBps,
  platformFeeBps,
}: SavingsInput): SavingsResult {
  const revenue = Number.isFinite(monthlyRevenueCents) ? Math.max(0, Math.round(monthlyRevenueCents)) : 0;
  const share = Number.isFinite(webSharePct) ? Math.min(100, Math.max(0, webSharePct)) : 0;
  const annualWebCents = Math.round((revenue * 12 * share) / 100);
  const annualStoreFeeCents = feeCents(annualWebCents, storeFeeBps);
  const annualPlatformFeeCents = feeCents(annualWebCents, platformFeeBps);
  return {
    annualWebCents,
    annualStoreFeeCents,
    annualPlatformFeeCents,
    annualGainCents: annualStoreFeeCents - annualPlatformFeeCents,
  };
}

/** 3000 points de base → « 30 % ». */
export function bpsToPercentLabel(bps: number) {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bps / 100)} %`;
}

/** Part conservée par le studio : 500 bps de commission → « 95 % ». */
export function keptPercentLabel(feeBps: number) {
  return bpsToPercentLabel(10_000 - feeBps);
}

/** Montant arrondi à l'euro (affichage marketing). */
export function formatEurosRounded(cents: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(cents / 100));
}
