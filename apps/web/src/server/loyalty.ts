import 'server-only';
import { newId, type Currency } from '@devappstore/core';
import {
  and,
  asc,
  count,
  db,
  desc,
  eq,
  gameLinks,
  games,
  inArray,
  items,
  loyaltyEntries,
  loyaltyRedemptions,
  loyaltyRewards,
  lte,
  ne,
  orders,
  sql,
  type DB,
  type LoyaltyReason,
  type LoyaltyRewardKind,
} from '@devappstore/db';
import { enqueueDelivery } from '@/server/delivery';
import {
  addDays,
  expiringSoon,
  isLoyaltyEnabled,
  isRewardWithinBudget,
  loyaltyConfigFromEnv,
  pointsForFee,
  pointsToRevoke,
  replayLedger,
  type LedgerEntry,
  type LedgerState,
  type LoyaltyConfig,
} from '@/server/loyalty-logic';

/*
 * Programme de fidélité « Points Dev AppStore » (phase 3) — règles et garde-fous : docs/product/loyalty.md.
 * Les points ne s'achètent pas, ne se convertissent pas en argent, ne se transfèrent pas et expirent.
 *
 * Toute écriture qui dépend du solde se fait sous un verrou consultatif transactionnel par utilisateur
 * (pg_advisory_xact_lock) : les rachats concurrents ne peuvent pas dépenser deux fois les mêmes points.
 */

export { isLoyaltyEnabled } from '@/server/loyalty-logic';

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
type Exec = DB | Tx;

export function getLoyaltyConfig(): LoyaltyConfig {
  return loyaltyConfigFromEnv();
}

async function lockUser(tx: Tx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`devappstore:loyalty:${userId}`}))`);
}

async function loadLedger(ex: Exec, userId: string): Promise<LedgerEntry[]> {
  return ex
    .select({
      id: loyaltyEntries.id,
      delta: loyaltyEntries.delta,
      reason: loyaltyEntries.reason,
      orderId: loyaltyEntries.orderId,
      refEntryId: loyaltyEntries.refEntryId,
      expiresAt: loyaltyEntries.expiresAt,
      createdAt: loyaltyEntries.createdAt,
    })
    .from(loyaltyEntries)
    .where(eq(loyaltyEntries.userId, userId))
    .orderBy(asc(loyaltyEntries.seq));
}

async function ledgerState(ex: Exec, userId: string, now: Date): Promise<LedgerState> {
  return replayLedger(await loadLedger(ex, userId), now);
}

// -------------------------------------------------------------------------------------------------
// Attribution / reprise
// -------------------------------------------------------------------------------------------------

export type AwardResult =
  | { status: 'awarded'; points: number; entryId: string }
  | { status: 'already_awarded'; points: number; entryId: string }
  | { status: 'skipped'; points: 0; reason: 'disabled' | 'order_not_found' | 'not_paid' | 'no_points' | 'revoked' };

/**
 * Attribue les points d'une commande payée — IDEMPOTENT : au plus une attribution par commande
 * (UNIQUE(order_id, reason) + vérification sous verrou). Barème : ⌊commission / LOYALTY_FEE_CENTS_PER_POINT⌋.
 * Ne fait rien si le programme est désactivé, si la commande n'est pas payée ou si elle a déjà été reprise.
 */
export async function awardPointsForOrder(orderId: string, opts: { now?: Date } = {}): Promise<AwardResult> {
  if (!isLoyaltyEnabled()) return { status: 'skipped', points: 0, reason: 'disabled' };
  const now = opts.now ?? new Date();
  const cfg = getLoyaltyConfig();
  const [order] = await db
    .select({ userId: orders.userId, status: orders.status, platformFeeCents: orders.platformFeeCents })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!order) return { status: 'skipped', points: 0, reason: 'order_not_found' };
  if (order.status !== 'paid') return { status: 'skipped', points: 0, reason: 'not_paid' };
  const points = pointsForFee(order.platformFeeCents, cfg);
  if (points <= 0) return { status: 'skipped', points: 0, reason: 'no_points' };

  return db.transaction(async (tx): Promise<AwardResult> => {
    await lockUser(tx, order.userId);
    const existing = await tx
      .select({ id: loyaltyEntries.id, delta: loyaltyEntries.delta, reason: loyaltyEntries.reason })
      .from(loyaltyEntries)
      .where(and(eq(loyaltyEntries.orderId, orderId), inArray(loyaltyEntries.reason, ['order_award', 'order_revoke'])));
    const award = existing.find((e) => e.reason === 'order_award');
    if (award) return { status: 'already_awarded', points: award.delta, entryId: award.id };
    if (existing.some((e) => e.reason === 'order_revoke')) return { status: 'skipped', points: 0, reason: 'revoked' };
    const id = newId('lpt');
    const inserted = await tx
      .insert(loyaltyEntries)
      .values({ id, userId: order.userId, delta: points, reason: 'order_award', orderId, expiresAt: addDays(now, cfg.pointsTtlDays), createdAt: now })
      .onConflictDoNothing()
      .returning({ id: loyaltyEntries.id });
    if (!inserted.length) {
      const [again] = await tx
        .select({ id: loyaltyEntries.id, delta: loyaltyEntries.delta })
        .from(loyaltyEntries)
        .where(and(eq(loyaltyEntries.orderId, orderId), eq(loyaltyEntries.reason, 'order_award')));
      return { status: 'already_awarded', points: again?.delta ?? points, entryId: again?.id ?? id };
    }
    return { status: 'awarded', points, entryId: id };
  });
}

export type RevokeResult =
  | { status: 'revoked'; points: number; awarded: number }
  | { status: 'already_revoked'; points: number }
  | { status: 'skipped'; points: 0; reason: 'order_not_found' };

/**
 * Reprend les points d'une commande remboursée — IDEMPOTENT (une reprise par commande).
 * Reprend les points attribués moins ceux déjà expirés, bornés par le solde disponible : le solde n'est jamais négatif.
 * Si la commande n'avait pas (encore) de points, une reprise de 0 point est inscrite : elle bloque toute attribution
 * ultérieure (remboursement traité avant le passage à « payé » d'un webhook en retard).
 * Fonctionne même programme désactivé (on ne laisse jamais des points sur une commande remboursée).
 */
export async function revokePointsForOrder(orderId: string, opts: { now?: Date; note?: string } = {}): Promise<RevokeResult> {
  const now = opts.now ?? new Date();
  const [order] = await db.select({ userId: orders.userId }).from(orders).where(eq(orders.id, orderId));
  if (!order) return { status: 'skipped', points: 0, reason: 'order_not_found' };

  return db.transaction(async (tx): Promise<RevokeResult> => {
    await lockUser(tx, order.userId);
    const [prev] = await tx
      .select({ delta: loyaltyEntries.delta })
      .from(loyaltyEntries)
      .where(and(eq(loyaltyEntries.orderId, orderId), eq(loyaltyEntries.reason, 'order_revoke')));
    if (prev) return { status: 'already_revoked', points: -prev.delta };
    const state = await ledgerState(tx, order.userId, now);
    const awarded = state.lots.find((l) => l.orderId === orderId)?.initial ?? 0;
    const points = pointsToRevoke(state, orderId);
    const inserted = await tx
      .insert(loyaltyEntries)
      .values({ id: newId('lpt'), userId: order.userId, delta: -points, reason: 'order_revoke', orderId, note: opts.note ?? null, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: loyaltyEntries.id });
    if (!inserted.length) return { status: 'already_revoked', points };
    return { status: 'revoked', points, awarded };
  });
}

// -------------------------------------------------------------------------------------------------
// Lecture
// -------------------------------------------------------------------------------------------------

/** Solde disponible (lots non expirés), jamais négatif. */
export async function getBalance(userId: string, opts: { now?: Date } = {}): Promise<number> {
  return (await ledgerState(db, userId, opts.now ?? new Date())).balance;
}

export interface LoyaltyOverview {
  enabled: boolean;
  balance: number;
  expiringSoon: { points: number; expiresAt: Date }[];
  vouchers: { id: string; title: string; valueCents: number; currency: Currency; expiresAt: Date | null; createdAt: Date }[];
  config: LoyaltyConfig;
}

/** Résumé pour /account/points : solde, points qui expirent bientôt, bons de réduction utilisables. */
export async function getLoyaltyOverview(userId: string, opts: { now?: Date } = {}): Promise<LoyaltyOverview> {
  const now = opts.now ?? new Date();
  const cfg = getLoyaltyConfig();
  const state = await ledgerState(db, userId, now);
  const vouchers = await db
    .select({
      id: loyaltyRedemptions.id,
      title: loyaltyRedemptions.title,
      valueCents: loyaltyRedemptions.valueCents,
      currency: loyaltyRedemptions.currency,
      expiresAt: loyaltyRedemptions.expiresAt,
      createdAt: loyaltyRedemptions.createdAt,
    })
    .from(loyaltyRedemptions)
    .where(and(eq(loyaltyRedemptions.userId, userId), eq(loyaltyRedemptions.kind, 'discount'), eq(loyaltyRedemptions.status, 'issued')))
    .orderBy(asc(loyaltyRedemptions.expiresAt));
  return {
    enabled: isLoyaltyEnabled(),
    balance: state.balance,
    expiringSoon: expiringSoon(state, now, cfg),
    vouchers: vouchers
      .filter((v) => !v.expiresAt || v.expiresAt.getTime() > now.getTime())
      .map((v) => ({ ...v, valueCents: v.valueCents ?? 0 })),
    config: cfg,
  };
}

export interface HistoryRow {
  id: string;
  delta: number;
  reason: LoyaltyReason;
  createdAt: Date;
  expiresAt: Date | null;
  note: string | null;
  orderId: string | null;
  itemTitle: string | null;
  gameName: string | null;
  redemptionTitle: string | null;
}

/** Historique des mouvements (plus récents d'abord). Les expirations à 0 point (lot déjà consommé) sont masquées. */
export async function listHistory(userId: string, opts: { limit?: number; offset?: number } = {}): Promise<{ rows: HistoryRow[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const where = and(eq(loyaltyEntries.userId, userId), ne(loyaltyEntries.delta, 0));
  const rows = await db
    .select({
      id: loyaltyEntries.id,
      delta: loyaltyEntries.delta,
      reason: loyaltyEntries.reason,
      createdAt: loyaltyEntries.createdAt,
      expiresAt: loyaltyEntries.expiresAt,
      note: loyaltyEntries.note,
      orderId: loyaltyEntries.orderId,
      itemTitle: orders.itemTitle,
      gameName: games.name,
      redemptionTitle: loyaltyRedemptions.title,
    })
    .from(loyaltyEntries)
    .leftJoin(orders, eq(orders.id, loyaltyEntries.orderId))
    .leftJoin(games, eq(games.id, orders.gameId))
    .leftJoin(loyaltyRedemptions, eq(loyaltyRedemptions.id, loyaltyEntries.redemptionId))
    .where(where)
    .orderBy(desc(loyaltyEntries.createdAt), desc(loyaltyEntries.seq))
    .limit(limit)
    .offset(offset);
  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(loyaltyEntries).where(where);
  return { rows, total };
}

export interface RewardView {
  id: string;
  kind: LoyaltyRewardKind;
  title: string;
  description: string;
  pointsCost: number;
  valueCents: number | null;
  currency: Currency;
  voucherTtlDays: number;
  game: { id: string; name: string; slug: string; iconUrl: string | null } | null;
  remainingStock: number | null;
  /** null = rachetable ; sinon raison lisible. */
  blocked: null | 'insufficient_points' | 'not_linked' | 'limit_reached' | 'out_of_stock';
}

/** Récompenses proposées au joueur (actives, dans leur période, dans le budget, jeu publié). */
export async function listRewards(userId: string, opts: { now?: Date } = {}): Promise<RewardView[]> {
  const now = opts.now ?? new Date();
  const cfg = getLoyaltyConfig();
  const rows = await db
    .select({ reward: loyaltyRewards, game: { id: games.id, name: games.name, slug: games.slug, iconUrl: games.iconUrl, status: games.status } })
    .from(loyaltyRewards)
    .leftJoin(games, eq(games.id, loyaltyRewards.gameId))
    .where(eq(loyaltyRewards.active, true))
    .orderBy(asc(loyaltyRewards.position), asc(loyaltyRewards.pointsCost));
  const visible = rows.filter(({ reward: r, game }) => isRewardOpen(r, now) && isRewardWithinBudget(r, cfg) && (r.kind === 'discount' || game?.status === 'live'));
  if (!visible.length) return [];

  const balance = await getBalance(userId, { now });
  const links = await db.select({ gameId: gameLinks.gameId }).from(gameLinks).where(eq(gameLinks.userId, userId));
  const linked = new Set(links.map((l) => l.gameId));
  const used = await db
    .select({ rewardId: loyaltyRedemptions.rewardId, n: count() })
    .from(loyaltyRedemptions)
    .where(and(eq(loyaltyRedemptions.userId, userId), ne(loyaltyRedemptions.status, 'cancelled')))
    .groupBy(loyaltyRedemptions.rewardId);
  const usedBy = new Map(used.map((u) => [u.rewardId, u.n]));

  return visible.map(({ reward: r, game }) => {
    const remainingStock = r.stock == null ? null : Math.max(0, r.stock - r.redeemedCount);
    let blocked: RewardView['blocked'] = null;
    if (remainingStock === 0) blocked = 'out_of_stock';
    else if (r.perUserLimit != null && (usedBy.get(r.id) ?? 0) >= r.perUserLimit) blocked = 'limit_reached';
    else if (r.kind === 'bonus_item' && r.gameId && !linked.has(r.gameId)) blocked = 'not_linked';
    else if (balance < r.pointsCost) blocked = 'insufficient_points';
    return {
      id: r.id,
      kind: r.kind,
      title: r.title,
      description: r.description,
      pointsCost: r.pointsCost,
      valueCents: r.valueCents,
      currency: r.currency,
      voucherTtlDays: r.voucherTtlDays,
      game: game && r.kind === 'bonus_item' ? { id: game.id, name: game.name, slug: game.slug, iconUrl: game.iconUrl } : null,
      remainingStock,
      blocked,
    };
  });
}

function isRewardOpen(r: typeof loyaltyRewards.$inferSelect, now: Date) {
  return r.active && (!r.startsAt || r.startsAt.getTime() <= now.getTime()) && (!r.endsAt || r.endsAt.getTime() > now.getTime());
}

// -------------------------------------------------------------------------------------------------
// Rachat
// -------------------------------------------------------------------------------------------------

export type RedeemErrorCode =
  | 'disabled'
  | 'reward_unavailable'
  | 'insufficient_points'
  | 'not_linked'
  | 'limit_reached'
  | 'out_of_stock';

export const REDEEM_ERROR_MESSAGES: Record<RedeemErrorCode, string> = {
  disabled: 'Le programme Points Dev AppStore n’est pas encore ouvert.',
  reward_unavailable: 'Cette récompense n’est plus disponible.',
  insufficient_points: 'Vous n’avez pas assez de points pour cette récompense.',
  not_linked: 'Liez d’abord votre compte de jeu pour recevoir cet objet.',
  limit_reached: 'Vous avez déjà obtenu cette récompense le nombre maximum de fois.',
  out_of_stock: 'Cette récompense est épuisée.',
};

export type RedeemResult =
  | { ok: true; redemptionId: string; kind: LoyaltyRewardKind; pointsSpent: number; balance: number; orderId: string | null }
  | { ok: false; code: RedeemErrorCode; message: string };

class RedeemAbort extends Error {
  constructor(readonly code: RedeemErrorCode) {
    super(code);
  }
}

/**
 * Échange des points contre une récompense — TRANSACTIONNEL, sous verrou par utilisateur :
 * contrôles (période, budget, liaison, limite par joueur, solde), décrément conditionnel du stock, rachat et débit
 * du registre dans la même transaction. Objet bonus : commande à 0 € « payée » puis livraison au jeu (après commit).
 */
export async function redeemReward(userId: string, rewardId: string, opts: { now?: Date } = {}): Promise<RedeemResult> {
  if (!isLoyaltyEnabled()) return { ok: false, code: 'disabled', message: REDEEM_ERROR_MESSAGES.disabled };
  const now = opts.now ?? new Date();
  const cfg = getLoyaltyConfig();
  let result: Extract<RedeemResult, { ok: true }>;
  try {
    result = await db.transaction(async (tx) => {
      await lockUser(tx, userId);
      const [reward] = await tx.select().from(loyaltyRewards).where(eq(loyaltyRewards.id, rewardId));
      if (!reward || !isRewardOpen(reward, now) || !isRewardWithinBudget(reward, cfg)) throw new RedeemAbort('reward_unavailable');

      let bonus: { gameId: string; currency: Currency; item: typeof items.$inferSelect; playerId: string } | null = null;
      if (reward.kind === 'bonus_item') {
        const [row] = await tx
          .select({ game: { id: games.id, status: games.status, currency: games.currency }, item: items })
          .from(items)
          .innerJoin(games, eq(games.id, items.gameId))
          .where(and(eq(items.id, reward.itemId ?? ''), eq(games.id, reward.gameId ?? '')));
        if (!row || row.game.status !== 'live') throw new RedeemAbort('reward_unavailable');
        const [link] = await tx
          .select({ playerId: gameLinks.playerId })
          .from(gameLinks)
          .where(and(eq(gameLinks.userId, userId), eq(gameLinks.gameId, row.game.id)));
        if (!link) throw new RedeemAbort('not_linked');
        bonus = { gameId: row.game.id, currency: row.game.currency, item: row.item, playerId: link.playerId };
      }

      if (reward.perUserLimit != null) {
        const [{ n } = { n: 0 }] = await tx
          .select({ n: count() })
          .from(loyaltyRedemptions)
          .where(and(eq(loyaltyRedemptions.userId, userId), eq(loyaltyRedemptions.rewardId, reward.id), ne(loyaltyRedemptions.status, 'cancelled')));
        if (n >= reward.perUserLimit) throw new RedeemAbort('limit_reached');
      }

      const state = await ledgerState(tx, userId, now);
      if (state.balance < reward.pointsCost) throw new RedeemAbort('insufficient_points');

      const stockOk = await tx
        .update(loyaltyRewards)
        .set({ redeemedCount: sql`${loyaltyRewards.redeemedCount} + 1` })
        .where(and(eq(loyaltyRewards.id, reward.id), sql`(${loyaltyRewards.stock} is null or ${loyaltyRewards.redeemedCount} < ${loyaltyRewards.stock})`))
        .returning({ id: loyaltyRewards.id });
      if (!stockOk.length) throw new RedeemAbort('out_of_stock');

      let orderId: string | null = null;
      if (bonus) {
        orderId = newId('ord');
        await tx.insert(orders).values({
          id: orderId,
          userId,
          gameId: bonus.gameId,
          itemId: bonus.item.id,
          productId: bonus.item.productId,
          itemTitle: bonus.item.title,
          playerId: bonus.playerId,
          quantity: bonus.item.quantity,
          amountCents: 0,
          platformFeeCents: 0,
          currency: bonus.currency,
          status: 'paid',
          paidAt: now,
          createdAt: now,
        });
      }

      const redemptionId = newId('lrd');
      await tx.insert(loyaltyRedemptions).values({
        id: redemptionId,
        userId,
        rewardId: reward.id,
        kind: reward.kind,
        pointsCost: reward.pointsCost,
        title: reward.title,
        valueCents: reward.valueCents,
        currency: reward.currency,
        status: reward.kind === 'discount' ? 'issued' : 'delivered',
        orderId,
        expiresAt: reward.kind === 'discount' ? addDays(now, reward.voucherTtlDays) : null,
        usedAt: reward.kind === 'discount' ? null : now,
        createdAt: now,
      });
      await tx.insert(loyaltyEntries).values({
        id: newId('lpt'),
        userId,
        delta: -reward.pointsCost,
        reason: 'redemption',
        redemptionId,
        createdAt: now,
      });
      return { ok: true as const, redemptionId, kind: reward.kind, pointsSpent: reward.pointsCost, balance: state.balance - reward.pointsCost, orderId };
    });
  } catch (e) {
    if (e instanceof RedeemAbort) return { ok: false, code: e.code, message: REDEEM_ERROR_MESSAGES[e.code] };
    throw e;
  }

  if (result.orderId) {
    // Livraison idempotente (une par commande). En cas d'échec ici, ensureBonusDeliveries() la rattrape.
    try {
      await enqueueDelivery(result.orderId);
    } catch (e) {
      console.error('[loyalty] Livraison de l’objet bonus non créée, à rattraper', result.orderId, e);
    }
  }
  return result;
}

/** Rattrapage (cron) : crée la livraison des objets bonus dont l'enqueue a échoué juste après le rachat. */
export async function ensureBonusDeliveries(): Promise<number> {
  const rows = await db.execute<{ order_id: string }>(sql`
    select r.order_id from loyalty_redemptions r
    left join deliveries d on d.order_id = r.order_id
    where r.kind = 'bonus_item' and r.status = 'delivered' and r.order_id is not null and d.id is null
    limit 100`);
  const list = (Array.isArray(rows) ? rows : (rows as { rows: { order_id: string }[] }).rows) as { order_id: string }[];
  let n = 0;
  for (const r of list) {
    try {
      await enqueueDelivery(r.order_id);
      n++;
    } catch (e) {
      console.error('[loyalty] Rattrapage de livraison impossible', r.order_id, e);
    }
  }
  return n;
}

// -------------------------------------------------------------------------------------------------
// Bons de réduction (à brancher dans le checkout)
// -------------------------------------------------------------------------------------------------

export type VoucherCheck = { ok: true; discountCents: number } | { ok: false; code: 'voucher_unavailable' | 'currency_mismatch' | 'order_too_small'; message: string };

type VoucherOrder = { amountCents: number; platformFeeCents: number; currency: Currency };

function checkVoucher(v: typeof loyaltyRedemptions.$inferSelect | undefined, userId: string, order: VoucherOrder, now: Date): VoucherCheck {
  if (!v || v.userId !== userId || v.kind !== 'discount' || v.status !== 'issued' || !v.valueCents || (v.expiresAt && v.expiresAt.getTime() <= now.getTime())) {
    return { ok: false, code: 'voucher_unavailable', message: 'Ce bon de réduction n’est plus utilisable.' };
  }
  if (v.currency !== order.currency) return { ok: false, code: 'currency_mismatch', message: 'Ce bon n’est pas utilisable dans cette devise.' };
  // Réduction financée par Dev AppStore sur SA commission : jamais plus que la commission de la commande.
  if (v.valueCents > order.platformFeeCents || v.valueCents >= order.amountCents) {
    return { ok: false, code: 'order_too_small', message: 'Ce bon s’utilise sur une commande d’un montant plus élevé.' };
  }
  return { ok: true, discountCents: v.valueCents };
}

/** Vérifie (sans le consommer) qu'un bon s'applique à une commande au prix plein `amountCents` / commission `platformFeeCents`. */
export async function previewDiscountVoucher(userId: string, redemptionId: string, order: VoucherOrder, opts: { now?: Date } = {}): Promise<VoucherCheck> {
  const [v] = await db.select().from(loyaltyRedemptions).where(eq(loyaltyRedemptions.id, redemptionId));
  return checkVoucher(v, userId, order, opts.now ?? new Date());
}

/**
 * Consomme le bon pour la commande `orderId` (atomique : issued → used). `order` = montants AVANT réduction.
 * Le checkout doit facturer amountCents − discountCents et prélever platformFeeCents − discountCents : le studio
 * reçoit exactement sa part habituelle.
 */
export async function applyDiscountVoucher(
  userId: string,
  redemptionId: string,
  orderId: string,
  order: VoucherOrder,
  opts: { now?: Date } = {},
): Promise<VoucherCheck> {
  const now = opts.now ?? new Date();
  const [v] = await db.select().from(loyaltyRedemptions).where(eq(loyaltyRedemptions.id, redemptionId));
  const check = checkVoucher(v, userId, order, now);
  if (!check.ok) return check;
  const rows = await db
    .update(loyaltyRedemptions)
    .set({ status: 'used', orderId, usedAt: now })
    .where(and(eq(loyaltyRedemptions.id, redemptionId), eq(loyaltyRedemptions.userId, userId), eq(loyaltyRedemptions.status, 'issued')))
    .returning({ id: loyaltyRedemptions.id });
  if (!rows.length) return { ok: false, code: 'voucher_unavailable', message: 'Ce bon de réduction n’est plus utilisable.' };
  return check;
}

/** Commande abandonnée ou échouée (jamais payée) : le bon redevient utilisable (jusqu'à sa date d'expiration). */
export async function releaseDiscountVoucher(orderId: string): Promise<boolean> {
  const [order] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
  if (!order || order.status === 'paid' || order.status === 'refunded') return false;
  const rows = await db
    .update(loyaltyRedemptions)
    .set({ status: 'issued', orderId: null, usedAt: null })
    .where(and(eq(loyaltyRedemptions.orderId, orderId), eq(loyaltyRedemptions.status, 'used'), eq(loyaltyRedemptions.kind, 'discount')))
    .returning({ id: loyaltyRedemptions.id });
  return rows.length > 0;
}

// -------------------------------------------------------------------------------------------------
// Expiration (job)
// -------------------------------------------------------------------------------------------------

/**
 * Matérialise les expirations dans le registre (une écriture `expiry` par lot expiré, idempotente).
 * Le solde n'en dépend pas (getBalance exclut déjà les lots expirés) : c'est pour l'historique du joueur.
 */
export async function expirePoints(opts: { now?: Date; userId?: string } = {}): Promise<{ users: number; entries: number; points: number }> {
  const now = opts.now ?? new Date();
  const candidates = opts.userId
    ? [{ userId: opts.userId }]
    : await db
        .selectDistinct({ userId: loyaltyEntries.userId })
        .from(loyaltyEntries)
        .where(
          and(
            lte(loyaltyEntries.expiresAt, now),
            sql`not exists (select 1 from loyalty_entries x where x.ref_entry_id = ${loyaltyEntries.id} and x.reason = 'expiry')`,
          ),
        )
        .limit(500);
  let entries = 0;
  let points = 0;
  for (const { userId } of candidates) {
    await db.transaction(async (tx) => {
      await lockUser(tx, userId);
      const state = await ledgerState(tx, userId, now);
      for (const lot of state.lots) {
        if (!lot.isExpired || lot.expiryRecorded) continue;
        const inserted = await tx
          .insert(loyaltyEntries)
          .values({ id: newId('lpt'), userId, delta: -lot.expired, reason: 'expiry', refEntryId: lot.entryId, createdAt: lot.expiresAt })
          .onConflictDoNothing()
          .returning({ id: loyaltyEntries.id });
        if (inserted.length) {
          entries++;
          points += lot.expired;
        }
      }
    });
  }
  // Bons de réduction expirés non utilisés.
  await db
    .update(loyaltyRedemptions)
    .set({ status: 'expired' })
    .where(and(eq(loyaltyRedemptions.status, 'issued'), lte(loyaltyRedemptions.expiresAt, now)));
  return { users: candidates.length, entries, points };
}
