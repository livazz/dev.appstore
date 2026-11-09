/*
 * Limiteur de débit partagé (API publique /api/v1, et tout autre appelant serveur).
 *
 * - `RateLimitStore` : fenêtre glissante (compteur pondéré sur deux fenêtres fixes, O(1) en mémoire par clé).
 *   L'interface est asynchrone pour être remplacée par une implémentation Redis (INCR + EXPIRE sur deux clés,
 *   ou script Lua) sans toucher aux appelants. L'implémentation en mémoire vaut pour UNE instance : en
 *   multi-instance chaque processus applique sa propre limite (à remplacer par Redis, cf. `setRateLimitStore`).
 * - `ConcurrencyLimiter` : nombre de connexions simultanées (flux SSE) par clé, avec libération idempotente.
 *
 * Module pur (sans `server-only`) : testable directement, sans dépendance Next ni base de données.
 */

export interface RateRule {
  max: number;
  windowMs: number;
}

export type RateDecision = { allowed: true; remaining: number } | { allowed: false; retryAfterS: number };

export interface RateLimitStore {
  /** Compte une requête pour `key` si la limite le permet (vérification et enregistrement atomiques). */
  hit(key: string, rule: RateRule, now?: number): Promise<RateDecision>;
  reset(): Promise<void>;
}

interface WindowState {
  /** Début de la fenêtre fixe courante (multiple de windowMs). */
  start: number;
  curr: number;
  prev: number;
}

/**
 * Fenêtre glissante approchée (« sliding window counter ») : estimation = prev × (part de la fenêtre précédente
 * encore couverte) + curr. Aucune rafale au changement de fenêtre (contrairement à une fenêtre fixe) et mémoire
 * constante par clé (contrairement à un journal d'horodatages). Synchrone entre lecture et écriture : deux requêtes
 * concurrentes ne peuvent pas passer toutes les deux sur la dernière place.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, WindowState>();

  constructor(private readonly maxKeys = 100_000) {}

  hitSync(key: string, rule: RateRule, now = Date.now()): RateDecision {
    const w = rule.windowMs;
    const start = Math.floor(now / w) * w;
    let s = this.windows.get(key);
    if (!s) s = { start, curr: 0, prev: 0 };
    else if (s.start !== start) s = { start, curr: 0, prev: s.start === start - w ? s.curr : 0 };
    const elapsed = now - start;
    const weight = 1 - elapsed / w;
    const estimate = s.prev * weight + s.curr;
    if (estimate + 1 > rule.max) {
      this.windows.set(key, s);
      return { allowed: false, retryAfterS: retryAfter(s, rule, elapsed) };
    }
    s.curr += 1;
    // Réinsertion : la Map garde l'ordre d'accès, les clés inactives sont évincées en premier.
    this.windows.delete(key);
    this.windows.set(key, s);
    this.evict();
    return { allowed: true, remaining: Math.max(0, Math.floor(rule.max - estimate - 1)) };
  }

  async hit(key: string, rule: RateRule, now = Date.now()): Promise<RateDecision> {
    return this.hitSync(key, rule, now);
  }

  async reset(): Promise<void> {
    this.windows.clear();
  }

  get size() {
    return this.windows.size;
  }

  private evict() {
    if (this.windows.size <= this.maxKeys) return;
    let excess = this.windows.size - this.maxKeys;
    for (const k of this.windows.keys()) {
      if (excess-- <= 0) break;
      this.windows.delete(k);
    }
  }
}

/** Secondes avant que l'estimation repasse sous la limite (au moins 1). */
function retryAfter(s: WindowState, rule: RateRule, elapsed: number): number {
  const w = rule.windowMs;
  const room = rule.max - 1; // il faut estimation ≤ max − 1 pour accepter une requête de plus
  let waitMs: number;
  if (s.curr > room) {
    // Attendre la fenêtre suivante, où `curr` devient `prev` et décroît linéairement.
    waitMs = w - elapsed + (s.curr > 0 ? w * Math.max(0, 1 - room / s.curr) : 0);
  } else if (s.prev > 0) {
    // prev × (1 − (elapsed + t) / w) + curr ≤ room
    waitMs = w * (1 - (room - s.curr) / s.prev) - elapsed;
  } else {
    waitMs = 1000;
  }
  return Math.max(1, Math.ceil(waitMs / 1000));
}

/* ------------------------------------------------------------------------------------------------ */
/* Connexions simultanées (flux SSE)                                                                 */
/* ------------------------------------------------------------------------------------------------ */

export interface ConcurrencyLimiter {
  /**
   * Réserve une place pour chacune des clés (toutes ou aucune). Renvoie une fonction de libération idempotente,
   * ou null si l'une des clés a atteint son plafond.
   */
  acquire(slots: { key: string; max: number }[]): (() => void) | null;
  active(key: string): number;
}

export class MemoryConcurrencyLimiter implements ConcurrencyLimiter {
  private readonly counts = new Map<string, number>();

  acquire(slots: { key: string; max: number }[]): (() => void) | null {
    if (slots.some((s) => (this.counts.get(s.key) ?? 0) >= s.max)) return null;
    for (const s of slots) this.counts.set(s.key, (this.counts.get(s.key) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const s of slots) {
        const n = (this.counts.get(s.key) ?? 1) - 1;
        if (n > 0) this.counts.set(s.key, n);
        else this.counts.delete(s.key);
      }
    };
  }

  active(key: string): number {
    return this.counts.get(key) ?? 0;
  }
}

/* ------------------------------------------------------------------------------------------------ */
/* Instances partagées (remplaçables, ex. Redis en phase 2)                                          */
/* ------------------------------------------------------------------------------------------------ */

const g = globalThis as { __devAppStoreRateStore?: RateLimitStore; __devAppStoreStreamSlots?: ConcurrencyLimiter };

/** Magasin partagé (survit au rechargement à chaud de Next en dev). */
export function getRateLimitStore(): RateLimitStore {
  return (g.__devAppStoreRateStore ??= new MemoryRateLimitStore());
}

/** Remplace le magasin (Redis en production multi-instance, ou magasin isolé dans les tests). */
export function setRateLimitStore(store: RateLimitStore) {
  g.__devAppStoreRateStore = store;
}

export function getStreamSlots(): ConcurrencyLimiter {
  return (g.__devAppStoreStreamSlots ??= new MemoryConcurrencyLimiter());
}

export function setStreamSlots(limiter: ConcurrencyLimiter) {
  g.__devAppStoreStreamSlots = limiter;
}
