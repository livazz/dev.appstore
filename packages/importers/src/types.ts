import type { Currency, ItemType, Period } from '@devappstore/core';

/** Store d'origine d'un produit importé. */
export type ImportSource = 'app_store' | 'google_play';

/**
 * Produit in-app importé depuis un store, normalisé au modèle Dev AppStore (montants en centimes).
 * `priceCents` est le prix public TTC constaté sur le store pour le territoire demandé.
 */
export interface ImportedProduct {
  source: ImportSource;
  /**
   * Identifiant produit tel que le jeu le connaît (product id du store).
   * Google Play, abonnements : `<productId>:<basePlanId>` (un article Dev AppStore par forfait de base).
   */
  productId: string;
  type: ItemType;
  title: string;
  subtitle?: string;
  priceCents: number;
  currency: Currency;
  /** Période de facturation des abonnements (absente si non représentable, voir les avertissements). */
  period?: Period;
  /** Identifiant technique côté store (id de ressource Apple, id de forfait / option d'achat Google), utile pour resynchroniser. */
  sourceId?: string;
}

export type ImportWarningCode =
  | 'no_price'
  | 'unsupported_currency'
  | 'unsupported_period'
  | 'installments_plan'
  | 'inactive'
  | 'fetch_failed';

/** Anomalie non bloquante : le produit est ignoré ou importé partiellement, l'UI doit l'afficher au studio. */
export interface ImportWarning {
  source: ImportSource;
  productId?: string;
  code: ImportWarningCode;
  message: string;
}

export interface ImportResult {
  products: ImportedProduct[];
  warnings: ImportWarning[];
}

/** Signature minimale de `fetch`, injectable (tests, proxy, instrumentation). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
