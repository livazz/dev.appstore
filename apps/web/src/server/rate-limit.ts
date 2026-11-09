/*
 * Limiteur de débit partagé (API publique /api/v1, et tout autre appelant serveur).
 *
 * - `RateLimitStore` : fenêtre glissante (compteur pondéré sur deux fenêtres fixes). Deux implémentations :
 *   `MemoryRateLimitStore` (défaut, O(1) par clé, vaut pour UNE instance) et `PostgresRateLimitStore`
 *   (`RATE_LIMIT_STORE=postgres` : compteurs partagés par toutes les instances, table `rate_limit_counters`,
 *   incrément conditionnel atomique). Interface asynchrone : un magasin Redis se brancherait de la même façon.
 * - `ConcurrencyLimiter` : nombre de connexions simultanées (flux SSE) par clé, avec libération idempotente.
 *   Toujours PAR INSTANCE (un flux vit dans un processus) : avec N instances, le plafond effectif est au plus
 *   N × la limite (voir docs/deploy.md, « Plusieurs instances »).
 *
 * Module pur (sans `server-only`) : testable directement, sans dépendance Next ; la base n'est chargée
 * (import dynamique) que par le magasin Postgres.
 */

import { sql, type SQL } from 'drizzle-orm';

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
/* Magasin Postgres (multi-instance)                                                                 */
/* ------------------------------------------------------------------------------------------------ */

/** Sous-ensemble de Drizzle utilisé (PGlite renvoie `{ rows }`, postgres-js un tableau). */
export interface SqlExecutor {
  execute(query: SQL): Promise<unknown>;
}

const rowsOf = (res: unknown): Record<string, unknown>[] =>
  (Array.isArray(res) ? res : ((res as { rows?: Record<string, unknown>[] } | null)?.rows ?? [])) as Record<string, unknown>[];

export interface PostgresRateLimitOptions {
  /** Base à utiliser (défaut : `db` de @devappstore/db, chargé à la première requête). */
  db?: SqlExecutor;
  /** Intervalle minimal entre deux purges des compteurs expirés, par instance. */
  purgeEveryMs?: number;
  /** Magasin de repli si la base est injoignable (défaut : mémoire, limite par instance). null = erreur propagée. */
  fallback?: RateLimitStore | null;
}

/**
 * Fenêtre glissante partagée : une ligne par (clé, fenêtre fixe) dans `rate_limit_counters`
 * (packages/db/src/schema/ratelimit.ts). Vérification et incrément en UNE requête :
 * `INSERT … ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1 WHERE <estimation + 1 ≤ max>` —
 * le verrou de ligne de l'UPSERT sérialise les requêtes concurrentes sur une même clé, et la condition est
 * réévaluée sur la dernière version de la ligne : jamais plus de `max` requêtes acceptées, quel que soit le
 * nombre d'instances. Base injoignable : repli sur le magasin mémoire (limite par instance) plutôt que de bloquer.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  private dbP: Promise<SqlExecutor> | null;
  private readonly purgeEveryMs: number;
  private readonly fallback: RateLimitStore | null;
  private lastPurge = 0;
  private warned = false;

  constructor(opts: PostgresRateLimitOptions = {}) {
    this.dbP = opts.db ? Promise.resolve(opts.db) : null;
    this.purgeEveryMs = opts.purgeEveryMs ?? 60_000;
    this.fallback = opts.fallback === undefined ? new MemoryRateLimitStore() : opts.fallback;
  }

  private db(): Promise<SqlExecutor> {
    return (this.dbP ??= import('@devappstore/db').then((m) => m.db as unknown as SqlExecutor));
  }

  async hit(key: string, rule: RateRule, now = Date.now()): Promise<RateDecision> {
    try {
      const d = await this.hitDb(key, rule, now);
      this.maybePurge(now);
      return d;
    } catch (e) {
      if (!this.fallback) throw e;
      if (!this.warned) {
        this.warned = true;
        console.error('[rate-limit] magasin Postgres indisponible, repli en mémoire (limite par instance)', e);
      }
      return this.fallback.hit(key, rule, now);
    }
  }

  private async hitDb(key: string, rule: RateRule, now: number): Promise<RateDecision> {
    const db = await this.db();
    const w = rule.windowMs;
    const start = Math.floor(now / w) * w;
    const prevStart = start - w;
    const elapsed = now - start;
    const weight = 1 - elapsed / w;
    const expires = start + 2 * w;
    const res = await db.execute(sql`
      with p as (
        select coalesce((select count from rate_limit_counters where key = ${key} and window_start = ${prevStart}::bigint), 0) as prev
      )
      insert into rate_limit_counters as c (key, window_start, count, expires_at)
      select ${key}, ${start}::bigint, 1, ${expires}::bigint from p where p.prev * ${weight}::float8 + 1 <= ${rule.max}::float8
      on conflict (key, window_start) do update set count = c.count + 1
        where (select prev from p) * ${weight}::float8 + c.count + 1 <= ${rule.max}::float8
      returning c.count as count, (select prev from p) as prev`);
    const row = rowsOf(res)[0];
    if (row) {
      const estimate = Number(row.prev) * weight + Number(row.count); // après incrément
      return { allowed: true, remaining: Math.max(0, Math.floor(rule.max - estimate)) };
    }
    const cur = rowsOf(
      await db.execute(sql`
        select window_start, count from rate_limit_counters
        where key = ${key} and window_start in (${start}::bigint, ${prevStart}::bigint)`),
    );
    const countAt = (ws: number) => Number(cur.find((r) => Number(r.window_start) === ws)?.count ?? 0);
    return { allowed: false, retryAfterS: retryAfter({ start, curr: countAt(start), prev: countAt(prevStart) }, rule, elapsed) };
  }

  /** Purge en arrière-plan, au plus une fois par `purgeEveryMs` et par instance. */
  private maybePurge(now: number) {
    if (now - this.lastPurge < this.purgeEveryMs) return;
    this.lastPurge = now;
    this.purgeExpired(now).catch((e) => console.error('[rate-limit] purge impossible', e));
  }

  /** Supprime les compteurs qui ne servent plus à aucune estimation. Renvoie le nombre de lignes supprimées. */
  async purgeExpired(now = Date.now()): Promise<number> {
    const db = await this.db();
    return rowsOf(await db.execute(sql`delete from rate_limit_counters where expires_at < ${now}::bigint returning 1 as x`)).length;
  }

  async reset(): Promise<void> {
    const db = await this.db();
    await db.execute(sql`delete from rate_limit_counters`);
    await this.fallback?.reset();
  }
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
/* Instances partagées (remplaçables)                                                                 */
/* ------------------------------------------------------------------------------------------------ */

const g = globalThis as { __devAppStoreRateStore?: RateLimitStore; __devAppStoreStreamSlots?: ConcurrencyLimiter };

/** Magasin selon `RATE_LIMIT_STORE` : `memory` (défaut) ou `postgres` (partagé entre instances). */
export function createRateLimitStore(env: Record<string, string | undefined> = process.env): RateLimitStore {
  const kind = env.RATE_LIMIT_STORE || 'memory';
  if (kind === 'postgres') return new PostgresRateLimitStore();
  if (kind !== 'memory') throw new Error(`RATE_LIMIT_STORE inconnu : ${kind} (attendu : memory ou postgres)`);
  return new MemoryRateLimitStore();
}

/** Magasin partagé (survit au rechargement à chaud de Next en dev). */
export function getRateLimitStore(): RateLimitStore {
  return (g.__devAppStoreRateStore ??= createRateLimitStore());
}

/** Remplace le magasin (ex. Redis, ou magasin isolé dans les tests). */
export function setRateLimitStore(store: RateLimitStore) {
  g.__devAppStoreRateStore = store;
}

export function getStreamSlots(): ConcurrencyLimiter {
  return (g.__devAppStoreStreamSlots ??= new MemoryConcurrencyLimiter());
}

export function setStreamSlots(limiter: ConcurrencyLimiter) {
  g.__devAppStoreStreamSlots = limiter;
}
