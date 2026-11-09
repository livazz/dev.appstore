/*
 * Points Dev AppStore — logique pure (sans base de données), testée par loyalty-logic.test.ts.
 * Règles : docs/product/loyalty.md.
 */

export interface LoyaltyConfig {
  /** Centimes de commission Dev AppStore par point attribué (1 point par tranche entière). */
  feeCentsPerPoint: number;
  /** Durée de validité d'un lot de points (jours). */
  pointsTtlDays: number;
  /** Coût maximal d'une récompense financée par Dev AppStore, en points de base de la commission qui a généré les points. */
  maxCostBps: number;
  /** Fenêtre d'avertissement avant expiration (jours). */
  expiryNoticeDays: number;
}

/**
 * Les bons de réduction ne sont pas encore appliqués au checkout (createCheckout les ignore, le webhook refuse toute
 * remise) : tant que ce drapeau est faux, les récompenses `discount` ne sont ni proposées ni rachetables, pour ne
 * pas débiter des points contre un bon inutilisable (revue 2026-11, C-6). À passer à true dans la même PR que le
 * branchement du bon au checkout (montant et commission remisés, contrôle du webhook adapté).
 */
export const DISCOUNT_VOUCHERS_ENABLED = false;

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  feeCentsPerPoint: 10,
  pointsTtlDays: 365,
  maxCostBps: 2000,
  expiryNoticeDays: 30,
};

function intEnv(raw: string | undefined, fallback: number, min: number, max: number): number {
  const s = raw?.trim();
  if (!s) return fallback;
  const n = Number(s);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/** Configuration depuis l'environnement (valeurs invalides → défauts). */
export function loyaltyConfigFromEnv(env: Record<string, string | undefined> = process.env): LoyaltyConfig {
  return {
    feeCentsPerPoint: intEnv(env.LOYALTY_FEE_CENTS_PER_POINT, DEFAULT_LOYALTY_CONFIG.feeCentsPerPoint, 1, 100_000),
    pointsTtlDays: intEnv(env.LOYALTY_POINTS_TTL_DAYS, DEFAULT_LOYALTY_CONFIG.pointsTtlDays, 1, 3650),
    maxCostBps: intEnv(env.LOYALTY_MAX_COST_BPS, DEFAULT_LOYALTY_CONFIG.maxCostBps, 0, 10_000),
    expiryNoticeDays: DEFAULT_LOYALTY_CONFIG.expiryNoticeDays,
  };
}

/**
 * Programme actif ? `LOYALTY_ENABLED` (1/true/0/false) ; à défaut actif hors production seulement
 * (validation juridique requise avant l'ouverture, cf. docs/product/loyalty.md).
 */
export function isLoyaltyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.LOYALTY_ENABLED?.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'no') return false;
  return env.NODE_ENV !== 'production';
}

/** Points attribués pour une commande : ⌊commission / feeCentsPerPoint⌋ (0 si commission nulle ou négative). */
export function pointsForFee(platformFeeCents: number, cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): number {
  if (!Number.isFinite(platformFeeCents) || platformFeeCents <= 0) return 0;
  return Math.floor(platformFeeCents / cfg.feeCentsPerPoint);
}

const DAY_MS = 86_400_000;
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

/**
 * Coût minimal en points d'une réduction de `valueCents` financée par Dev AppStore pour respecter le plafond
 * « coût ≤ maxCostBps de la commission » : P ≥ V / (X · k).
 */
export function minPointsForDiscount(valueCents: number, cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): number {
  if (cfg.maxCostBps <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil((valueCents * 10_000) / (cfg.maxCostBps * cfg.feeCentsPerPoint));
}

export interface RewardEconomics {
  kind: 'discount' | 'bonus_item';
  pointsCost: number;
  valueCents: number | null;
}

/** La récompense respecte-t-elle le budget ? (bonus_item : financé par le studio, aucun coût Dev AppStore). */
export function isRewardWithinBudget(r: RewardEconomics, cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): boolean {
  if (!Number.isInteger(r.pointsCost) || r.pointsCost <= 0) return false;
  if (r.kind === 'bonus_item') return true;
  if (!r.valueCents || r.valueCents <= 0) return false;
  return r.pointsCost >= minPointsForDiscount(r.valueCents, cfg);
}

/** Montant minimum de commande pour qu'un bon de `valueCents` soit couvert par la commission (`feeBps`). */
export function minOrderForDiscount(valueCents: number, feeBps: number): number | null {
  if (feeBps <= 0) return null;
  return Math.ceil((valueCents * 10_000) / feeBps);
}

// -------------------------------------------------------------------------------------------------
// Rejeu du registre par lots
// -------------------------------------------------------------------------------------------------

export interface LedgerEntry {
  id: string;
  delta: number;
  reason: 'order_award' | 'order_revoke' | 'redemption' | 'expiry' | 'adjustment';
  orderId: string | null;
  refEntryId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface Lot {
  entryId: string;
  orderId: string | null;
  initial: number;
  remaining: number;
  /** Points perdus à l'expiration (> 0 seulement si le lot est expiré). */
  expired: number;
  expiresAt: Date;
  createdAt: Date;
  isExpired: boolean;
  /** Une écriture `expiry` existe déjà pour ce lot. */
  expiryRecorded: boolean;
}

export interface LedgerState {
  /**
   * Solde disponible = points restants des lots non expirés − dette. Peut être NÉGATIF : une reprise (remboursement,
   * rétractation, litige) n'est jamais bornée par le solde (revue 2026-11, C-2) ; les points gagnés ensuite
   * remboursent d'abord la dette, et aucun rachat n'est possible tant que le solde est insuffisant.
   */
  balance: number;
  /** Points repris qui n'ont pas pu être prélevés sur des lots (dépensés avant le remboursement). */
  debt: number;
  lots: Lot[];
  /** Débits qui n'ont pas pu être couverts (ne doit pas arriver : les écritures sont bornées sous verrou). */
  uncovered: number;
}

const byExpiry = (a: Lot, b: Lot) => a.expiresAt.getTime() - b.expiresAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime();

/**
 * Rejoue le registre (dans l'ordre d'insertion) à la date `now`.
 * Un débit consomme d'abord le lot de sa commande (reprise), puis les lots non expirés qui expirent le plus tôt.
 * Un lot dont `expiresAt <= t` est expiré à l'instant t : il ne peut plus être consommé et ne compte plus dans le solde.
 */
export function replayLedger(entries: readonly LedgerEntry[], now: Date): LedgerState {
  const lots: Lot[] = [];
  let uncovered = 0;
  let debt = 0;

  const expireUpTo = (t: Date) => {
    for (const lot of lots) {
      if (!lot.isExpired && lot.expiresAt.getTime() <= t.getTime()) {
        lot.isExpired = true;
        lot.expired = lot.remaining;
        lot.remaining = 0;
      }
    }
  };

  for (const e of entries) {
    expireUpTo(e.createdAt);
    if (e.reason === 'expiry') {
      const lot = lots.find((l) => l.entryId === e.refEntryId);
      if (lot) {
        lot.expiryRecorded = true;
        if (!lot.isExpired) {
          // Expiration enregistrée en avance (horloges décalées) : on l'applique telle quelle.
          lot.isExpired = true;
          lot.expired = lot.remaining;
          lot.remaining = 0;
        }
      }
      continue;
    }
    if (e.delta > 0) {
      if (!e.expiresAt) continue; // garde-fou (contrainte CHECK en base)
      // Les nouveaux points remboursent d'abord la dette.
      const repaid = Math.min(debt, e.delta);
      debt -= repaid;
      lots.push({
        entryId: e.id,
        orderId: e.orderId,
        initial: e.delta,
        remaining: e.delta - repaid,
        expired: 0,
        expiresAt: e.expiresAt,
        createdAt: e.createdAt,
        isExpired: false,
        expiryRecorded: false,
      });
      continue;
    }
    let toConsume = -e.delta;
    const own = e.reason === 'order_revoke' && e.orderId ? lots.filter((l) => l.orderId === e.orderId && !l.isExpired) : [];
    const others = lots.filter((l) => !l.isExpired && !own.includes(l)).sort(byExpiry);
    for (const lot of [...own, ...others]) {
      if (toConsume <= 0) break;
      const take = Math.min(lot.remaining, toConsume);
      lot.remaining -= take;
      toConsume -= take;
    }
    // Reprise non couverte (points déjà dépensés) → dette ; tout autre débit non couvert est une anomalie.
    if (e.reason === 'order_revoke') debt += toConsume;
    else uncovered += toConsume;
  }
  expireUpTo(now);

  const balance = lots.reduce((s, l) => s + l.remaining, 0) - debt;
  return { balance, debt, lots, uncovered };
}

/** Lots encore valides qui expirent dans la fenêtre d'avertissement, regroupés par jour d'expiration. */
export function expiringSoon(state: LedgerState, now: Date, cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG) {
  const limit = addDays(now, cfg.expiryNoticeDays).getTime();
  return state.lots
    .filter((l) => !l.isExpired && l.remaining > 0 && l.expiresAt.getTime() <= limit)
    .sort(byExpiry)
    .map((l) => ({ points: l.remaining, expiresAt: l.expiresAt }));
}

/**
 * Nombre de points à reprendre lors du remboursement d'une commande : les points attribués pour cette commande,
 * moins ceux déjà expirés de ce lot. NON borné par le solde (revue 2026-11, C-2) : si le joueur a déjà dépensé ces
 * points, la reprise crée une dette (solde négatif) plutôt que de lui laisser la récompense obtenue avec.
 */
export function pointsToRevoke(state: LedgerState, orderId: string): number {
  const lot = state.lots.find((l) => l.orderId === orderId);
  if (!lot) return 0;
  return Math.max(0, lot.initial - lot.expired);
}
