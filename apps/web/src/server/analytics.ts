import 'server-only';
import { REDUCED_STORE_FEE_BPS, STORE_FEE_OPTIONS_BPS, feeCents, type Currency, type DeliveryStatus, type OrderStatus } from '@devappstore/core';
import type { AnyColumn } from 'drizzle-orm';
import { and, db, deliveries, desc, eq, games, gt, inArray, orders, sql, type DB } from '@devappstore/db';

/*
 * Agrégations de ventes (espace studio) et historique d'achats (joueur). Tâche « analytics ».
 * Toutes les fonctions acceptent une base en dernier paramètre (tests : createTestDb()).
 *
 * Fenêtre de N jours = les N derniers jours calendaires dans le fuseau `tz` (aujourd'hui inclus),
 * jusqu'à `now`. Date de référence d'une vente : paid_at (repli sur created_at).
 * Seules les commandes `paid` comptent dans le revenu ; les montants ne sont jamais mélangés entre devises.
 */

export const DEFAULT_TZ = 'Europe/Paris';

/** Rôles autorisés à voir les ventes et l'export CSV (matrice du modèle de menaces § 6.6, CHK-MT-06). */
export const SALES_ROLES = ['owner', 'admin', 'finance'] as const;

export interface WindowOptions {
  days: number;
  now?: Date;
  tz?: string;
}

export interface SalesWindow {
  /** Premier jour inclus (YYYY-MM-DD, fuseau tz). */
  startDay: string;
  /** Dernier jour inclus (aujourd'hui dans le fuseau tz). */
  endDay: string;
  /** Tous les jours de la fenêtre, du plus ancien au plus récent. */
  dayList: string[];
  now: Date;
  tz: string;
}

/** Jour calendaire (YYYY-MM-DD) d'un instant dans un fuseau donné. */
export function localDay(at: Date, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function salesWindow({ days, now = new Date(), tz = DEFAULT_TZ }: WindowOptions): SalesWindow {
  const n = Math.max(1, Math.floor(days));
  const endDay = localDay(now, tz);
  const dayList = Array.from({ length: n }, (_, i) => addDays(endDay, i - n + 1));
  return { startDay: dayList[0], endDay, dayList, now, tz };
}

// Les timestamps sont stockés en UTC (timestamp sans fuseau).
const saleTs = sql`coalesce(${orders.paidAt}, ${orders.createdAt})`;
const localTs = (tz: string) => sql`((${saleTs}) AT TIME ZONE 'UTC') AT TIME ZONE ${tz}`;
const localDayExpr = (tz: string) => sql<string>`to_char(${localTs(tz)}, 'YYYY-MM-DD')`;

function inWindow(w: SalesWindow) {
  return and(sql`${localTs(w.tz)} >= ${w.startDay}::timestamp`, sql`${saleTs} <= ${w.now.toISOString()}::timestamp`);
}

/**
 * Une vente = commande à montant positif. Les commandes à 0 € (objets bonus de fidélité, livrés par le même canal)
 * n'entrent ni dans le revenu, ni dans le nombre d'achats, ni dans le panier moyen, les meilleures ventes ou l'export.
 */
const isSale = gt(orders.amountCents, 0);
const paidSale = and(eq(orders.status, 'paid'), isSale);

/**
 * Commission store de référence pour « Gagné en plus » : taux réduit (15 %) par défaut — le cas le plus courant
 * (petits studios, abonnements après un an, cf. docs/legal/stores.md) et la comparaison la plus prudente ; 30 % au choix.
 */
export const DEFAULT_SALES_STORE_FEE_BPS: number = REDUCED_STORE_FEE_BPS;

/** Taux store accepté (un des STORE_FEE_OPTIONS_BPS), sinon le taux par défaut. */
export function resolveStoreFeeBps(bps: number | null | undefined): number {
  return typeof bps === 'number' && (STORE_FEE_OPTIONS_BPS as readonly number[]).includes(bps) ? bps : DEFAULT_SALES_STORE_FEE_BPS;
}

/** « 15 % », « 30 % » (libellé du taux affiché à côté de l'économie). */
export function storeFeeLabel(bps: number) {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bps / 100)} %`;
}

const sumOf = (col: AnyColumn) => sql<number>`coalesce(sum(${col}), 0)`.mapWith(Number);
const countRows = sql<number>`count(*)`.mapWith(Number);

export interface SalesTotals {
  currency: Currency;
  count: number;
  grossCents: number;
  /** Commission Dev AppStore réellement prélevée (somme de platform_fee_cents). */
  platformFeeCents: number;
  netCents: number;
  /** Ce que le studio aurait payé en plus via l'App Store / Google Play au taux `storeFeeBps`. */
  savingsCents: number;
  /** Commission store de référence utilisée pour `savingsCents` (points de base, un des STORE_FEE_OPTIONS_BPS). */
  storeFeeBps: number;
  avgCents: number;
}

export function emptyTotals(currency: Currency, storeFeeBps = DEFAULT_SALES_STORE_FEE_BPS): SalesTotals {
  return { currency, count: 0, grossCents: 0, platformFeeCents: 0, netCents: 0, savingsCents: 0, storeFeeBps, avgCents: 0 };
}

function toTotals(currency: Currency, count: number, gross: number, fee: number, storeFeeBps: number): SalesTotals {
  // Commission store évitée au taux choisi, moins la commission Dev AppStore réellement prélevée (jamais négatif).
  const savings = feeCents(gross, storeFeeBps) - fee;
  return {
    currency,
    count,
    grossCents: gross,
    platformFeeCents: fee,
    netCents: gross - fee,
    savingsCents: Math.max(0, savings),
    storeFeeBps,
    avgCents: count ? Math.round(gross / count) : 0,
  };
}

/**
 * Totaux de la fenêtre, une ligne par devise (la devise du jeu en premier, même vide).
 * `storeFeeBps` : commission store de comparaison (STORE_FEE_OPTIONS_BPS ; 15 % par défaut).
 */
export async function getSalesTotals(gameId: string, opts: WindowOptions & { storeFeeBps?: number }, database: DB = db): Promise<SalesTotals[]> {
  const w = salesWindow(opts);
  const storeFeeBps = resolveStoreFeeBps(opts.storeFeeBps);
  const [game] = await database.select({ currency: games.currency }).from(games).where(eq(games.id, gameId));
  const rows = await database
    .select({ currency: orders.currency, count: countRows, gross: sumOf(orders.amountCents), fee: sumOf(orders.platformFeeCents) })
    .from(orders)
    .where(and(eq(orders.gameId, gameId), paidSale, inWindow(w)))
    .groupBy(orders.currency);
  const totals = rows.map((r) => toTotals(r.currency, r.count, r.gross, r.fee, storeFeeBps));
  const main = game?.currency ?? totals[0]?.currency ?? 'EUR';
  const first = totals.find((t) => t.currency === main) ?? emptyTotals(main, storeFeeBps);
  return [first, ...totals.filter((t) => t.currency !== main).sort((a, b) => b.grossCents - a.grossCents)];
}

export interface DayRevenue {
  day: string;
  grossCents: number;
  count: number;
}

/** Revenu brut quotidien (jours sans vente à 0) pour une devise. */
export async function getDailyRevenue(gameId: string, currency: Currency, opts: WindowOptions, database: DB = db): Promise<DayRevenue[]> {
  const w = salesWindow(opts);
  const rows = await database
    .select({ day: localDayExpr(w.tz), gross: sumOf(orders.amountCents), count: countRows })
    .from(orders)
    .where(and(eq(orders.gameId, gameId), paidSale, eq(orders.currency, currency), inWindow(w)))
    .groupBy(sql`1`);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return w.dayList.map((day) => ({ day, grossCents: byDay.get(day)?.gross ?? 0, count: byDay.get(day)?.count ?? 0 }));
}

export interface TopItem {
  itemId: string;
  productId: string;
  title: string;
  count: number;
  units: number;
  grossCents: number;
}

/** Meilleures ventes par revenu brut. */
export async function getTopItems(gameId: string, currency: Currency, opts: WindowOptions & { limit?: number }, database: DB = db): Promise<TopItem[]> {
  const w = salesWindow(opts);
  return database
    .select({
      itemId: orders.itemId,
      productId: orders.productId,
      title: sql<string>`max(${orders.itemTitle})`,
      count: countRows,
      units: sumOf(orders.quantity),
      grossCents: sumOf(orders.amountCents),
    })
    .from(orders)
    .where(and(eq(orders.gameId, gameId), paidSale, eq(orders.currency, currency), inWindow(w)))
    .groupBy(orders.itemId, orders.productId)
    .orderBy(desc(sql`sum(${orders.amountCents})`), desc(countRows))
    .limit(opts.limit ?? 5);
}

export interface Transaction {
  id: string;
  date: Date;
  productId: string;
  itemTitle: string;
  playerId: string;
  quantity: number;
  amountCents: number;
  platformFeeCents: number;
  currency: Currency;
  orderStatus: OrderStatus;
  deliveryStatus: DeliveryStatus | null;
}

const VISIBLE_STATUSES: OrderStatus[] = ['paid', 'refunded'];

/** Transactions de la fenêtre (payées ou remboursées), plus récentes d'abord, avec le statut de livraison. */
export async function getTransactions(gameId: string, opts: WindowOptions & { limit?: number }, database: DB = db): Promise<Transaction[]> {
  const w = salesWindow(opts);
  const q = database
    .select({
      id: orders.id,
      date: sql<string>`to_char(${saleTs}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`.mapWith((v: string) => new Date(v)),
      productId: orders.productId,
      itemTitle: orders.itemTitle,
      playerId: orders.playerId,
      quantity: orders.quantity,
      amountCents: orders.amountCents,
      platformFeeCents: orders.platformFeeCents,
      currency: orders.currency,
      orderStatus: orders.status,
      deliveryStatus: deliveries.status,
    })
    .from(orders)
    .leftJoin(deliveries, eq(deliveries.orderId, orders.id))
    .where(and(eq(orders.gameId, gameId), inArray(orders.status, VISIBLE_STATUSES), isSale, inWindow(w)))
    .orderBy(desc(saleTs), desc(orders.id));
  return opts.limit ? q.limit(opts.limit) : q;
}

/**
 * Neutralise l'injection de formules (CSV injection) : un texte fourni par un studio ou un joueur (titre, product_id,
 * player_id) qui commence par = + - @ (ou tabulation / retour chariot) serait interprété comme une formule par Excel,
 * LibreOffice ou Sheets à l'ouverture de l'export (=HYPERLINK(…), =cmd|…). Préfixe apostrophe (recommandation OWASP).
 */
export function neutralizeFormula(s: string) {
  return /^[=+\-@\t\r＝＋－＠]/.test(s) ? `'${s}` : s;
}

/** Cellule CSV ; `untrusted` : texte saisi par un studio ou un joueur (neutralisé contre les formules). */
function csvCell(v: string | number, untrusted = false) {
  const s = untrusted ? neutralizeFormula(String(v)) : String(v);
  return /[",;\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const decimal = (cents: number) => (cents / 100).toFixed(2);

/** Export CSV (RFC 4180, séparateur virgule, montants décimaux avec point). */
export function transactionsToCsv(rows: Transaction[]) {
  const header = ['date_utc', 'order_id', 'product_id', 'article', 'player_id', 'quantite', 'montant_brut', 'commission_devappstore', 'montant_net', 'devise', 'statut_commande', 'statut_livraison'];
  const lines = rows.map((r) =>
    [
      csvCell(r.date.toISOString()),
      csvCell(r.id),
      csvCell(r.productId, true),
      csvCell(r.itemTitle, true),
      csvCell(r.playerId, true),
      csvCell(r.quantity),
      csvCell(decimal(r.amountCents)),
      csvCell(decimal(r.platformFeeCents)),
      csvCell(decimal(r.amountCents - r.platformFeeCents)),
      csvCell(r.currency),
      csvCell(r.orderStatus),
      csvCell(r.deliveryStatus ?? ''),
    ].join(','),
  );
  return [header.join(','), ...lines].join('\r\n') + '\r\n';
}

export interface PlayerPurchase {
  id: string;
  date: Date;
  gameId: string;
  gameName: string;
  gameSlug: string;
  gameIconUrl: string | null;
  itemTitle: string;
  quantity: number;
  amountCents: number;
  currency: Currency;
  orderStatus: OrderStatus;
  deliveryStatus: DeliveryStatus | null;
}

/** Historique d'achats d'un joueur (commandes payées ou remboursées), plus récentes d'abord. */
export async function getPlayerPurchases(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
  database: DB = db,
): Promise<{ rows: PlayerPurchase[]; total: number }> {
  const where = and(eq(orders.userId, userId), inArray(orders.status, VISIBLE_STATUSES));
  const [rows, [{ total }]] = await Promise.all([
    database
      .select({
        id: orders.id,
        date: sql<string>`to_char(${saleTs}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`.mapWith((v: string) => new Date(v)),
        gameId: orders.gameId,
        gameName: games.name,
        gameSlug: games.slug,
        gameIconUrl: games.iconUrl,
        itemTitle: orders.itemTitle,
        quantity: orders.quantity,
        amountCents: orders.amountCents,
        currency: orders.currency,
        orderStatus: orders.status,
        deliveryStatus: deliveries.status,
      })
      .from(orders)
      .innerJoin(games, eq(games.id, orders.gameId))
      .leftJoin(deliveries, eq(deliveries.orderId, orders.id))
      .where(where)
      .orderBy(desc(saleTs), desc(orders.id))
      .limit(opts.limit ?? 25)
      .offset(opts.offset ?? 0),
    database.select({ total: countRows }).from(orders).where(where),
  ]);
  return { rows, total };
}
