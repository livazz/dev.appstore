/*
 * Classements (logique pure, testée) : rang par nombre d'unités vendues sur une fenêtre glissante, départage par nom,
 * évolution par rapport au classement d'il y a une semaine.
 */

/** Fenêtre de calcul des classements (jours). */
export const RANKING_WINDOW_DAYS = 30;
/** Décalage du classement de comparaison pour l'évolution (jours). */
export const RANKING_TREND_OFFSET_DAYS = 7;

const DAY = 86_400_000;

export interface SalesTotals {
  units: number;
  revenueCents: number;
}

export type Trend = 'up' | 'down' | 'same' | 'new';

export interface RankedEntry<T> {
  rank: number;
  /** Rang dans le classement d'il y a une semaine (null si absent). */
  previousRank: number | null;
  trend: Trend;
  /** Places gagnées (positif) ou perdues (négatif) ; 0 si nouveau ou stable. */
  delta: number;
  units: number;
  revenueCents: number;
  entry: T;
}

/** Fenêtres [since, until[ du classement courant et de celui servant à l'évolution. */
export function rankingWindows(now: Date | number = Date.now(), days = RANKING_WINDOW_DAYS, offsetDays = RANKING_TREND_OFFSET_DAYS) {
  const t = typeof now === 'number' ? now : now.getTime();
  return {
    current: { since: new Date(t - days * DAY), until: new Date(t) },
    previous: { since: new Date(t - (days + offsetDays) * DAY), until: new Date(t - offsetDays * DAY) },
  };
}

/** Ordre des entrées vendues : unités décroissantes, puis nom (fr), puis identifiant (ordre total, stable). */
function order<T extends { id: string; name: string }>(entries: T[], sales: Map<string, SalesTotals>) {
  return entries
    .filter((e) => (sales.get(e.id)?.units ?? 0) > 0)
    .sort(
      (a, b) =>
        sales.get(b.id)!.units - sales.get(a.id)!.units ||
        a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/**
 * Classe des entrées (jeux ou articles) selon leurs ventes. Seules les entrées ayant au moins une vente sont classées.
 * `previous` (facultatif) : ventes de la fenêtre de comparaison, sur les mêmes entrées, pour l'évolution.
 */
export function rankBySales<T extends { id: string; name: string }>(
  entries: T[],
  sales: Map<string, SalesTotals>,
  previous: Map<string, SalesTotals> | null = null,
  limit = 100,
): RankedEntry<T>[] {
  const prevRank = new Map<string, number>();
  if (previous) order(entries, previous).forEach((e, i) => prevRank.set(e.id, i + 1));
  return order(entries, sales)
    .slice(0, Math.max(0, limit))
    .map((e, i) => {
      const rank = i + 1;
      const s = sales.get(e.id)!;
      const p = previous ? prevRank.get(e.id) ?? null : null;
      const delta = p == null ? 0 : p - rank;
      const trend: Trend = !previous ? 'same' : p == null ? 'new' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
      return { rank, previousRank: p, trend, delta, units: s.units, revenueCents: s.revenueCents, entry: e };
    });
}

/** Lignes d'agrégat SQL → Map (les sommes PostgreSQL peuvent arriver en chaîne). */
export function toSalesMap(rows: { key: string; units: number | string | null; revenueCents: number | string | null }[]): Map<string, SalesTotals> {
  return new Map(rows.map((r) => [r.key, { units: Number(r.units ?? 0), revenueCents: Number(r.revenueCents ?? 0) }]));
}
