/*
 * Règle des promotions programmées (pure, utilisable côté serveur comme côté client).
 *
 * Un article est « en promo » si son prix barré est supérieur à son prix ET si maintenant est dans la fenêtre
 * [promoStartsAt ?? -∞, promoEndsAt ?? +∞[. Hors fenêtre, le prix barré n'est pas affiché.
 * Le prix facturé est TOUJOURS `priceCents` (celui affiché) : la fenêtre ne change que l'affichage du prix barré
 * et de la remise, jamais le montant payé.
 */

export interface PromoFields {
  priceCents: number;
  oldPriceCents: number | null;
  promoStartsAt?: Date | string | null;
  promoEndsAt?: Date | string | null;
}

/** Horizon de « Bientôt en promo » (jours). */
export const UPCOMING_PROMO_DAYS = 14;

const ms = (d: Date | string | null | undefined): number | null => (d == null ? null : new Date(d).getTime());
const at = (now: Date | number) => (typeof now === 'number' ? now : now.getTime());

/** Prix barré supérieur au prix (indépendamment des dates). */
export function hasStrikePrice(i: PromoFields): boolean {
  return i.oldPriceCents != null && i.oldPriceCents > 0 && i.oldPriceCents > i.priceCents;
}

/** L'article est-il en promo à cet instant ? (début inclus, fin exclue) */
export function isPromoActive(i: PromoFields, now: Date | number = Date.now()): boolean {
  if (!hasStrikePrice(i)) return false;
  const t = at(now);
  const start = ms(i.promoStartsAt);
  const end = ms(i.promoEndsAt);
  return (start == null || start <= t) && (end == null || t < end);
}

/** Promo programmée qui commence dans le futur, au plus tard dans `horizonDays` jours. */
export function isPromoUpcoming(i: PromoFields, now: Date | number = Date.now(), horizonDays = UPCOMING_PROMO_DAYS): boolean {
  if (!hasStrikePrice(i)) return false;
  const t = at(now);
  const start = ms(i.promoStartsAt);
  const end = ms(i.promoEndsAt);
  if (start == null || start <= t || start > t + horizonDays * 86_400_000) return false;
  return end == null || end > start;
}

/** Prix barré à afficher maintenant (null hors fenêtre de promo). */
export function displayedOldPrice(i: PromoFields, now: Date | number = Date.now()): number | null {
  return isPromoActive(i, now) ? i.oldPriceCents : null;
}

/** Remise en % (arrondie à l'entier inférieur) d'un prix par rapport à un prix barré. */
export function pctOff(priceCents: number, oldPriceCents: number | null | undefined): number {
  if (oldPriceCents == null || oldPriceCents <= 0 || oldPriceCents <= priceCents) return 0;
  return Math.floor(((oldPriceCents - priceCents) * 100) / oldPriceCents);
}

/** Remise affichée maintenant (0 hors fenêtre). */
export function activeDiscountPct(i: PromoFields, now: Date | number = Date.now()): number {
  return isPromoActive(i, now) ? pctOff(i.priceCents, i.oldPriceCents) : 0;
}

/** Remise prévue d'une promo (quelle que soit la date) — pour « Bientôt en promo ». */
export function plannedDiscountPct(i: PromoFields): number {
  return pctOff(i.priceCents, i.oldPriceCents);
}

/** Montant facturé pour un article : toujours le prix affiché, `priceCents` (jamais le prix barré). */
export function chargedPriceCents(i: PromoFields): number {
  return i.priceCents;
}

/** Durée restante lisible : « 2 j 5 h », « 3 h 12 min », « 4 min », « terminée ». */
export function formatRemaining(msLeft: number): string {
  if (msLeft <= 0) return 'terminée';
  const min = Math.floor(msLeft / 60_000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d} j ${h} h`;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  return `${Math.max(1, m)} min`;
}
