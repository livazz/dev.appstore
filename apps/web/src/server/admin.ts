import 'server-only';
import type { AnyColumn } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { newId, type Currency, type DeliveryStatus, type GameStatus } from '@wolleen/core';
import {
  adminAuditLog,
  and,
  count,
  db,
  deliveries,
  desc,
  eq,
  gameModerationNotices,
  games,
  gte,
  ilike,
  inArray,
  items,
  or,
  orders,
  platformAdmins,
  session,
  sql,
  studioMembers,
  studios,
  user,
  userSuspensions,
  webhookAttempts,
  gameLinks,
  type DB,
  type ModerationAction,
  type PlatformAdminRole,
} from '@wolleen/db';
import { contextFromEnv, createMailerFromEnv, sendEmail, type Mailer } from '@wolleen/emails';
import { getCurrentUser, type SessionUser } from './session';
import { dispatchDelivery } from './delivery';
import { moderationEmail } from './admin-emails';
import {
  PAGE_SIZE,
  disableUserSchema,
  effectiveTakeRateBps,
  escapeLike,
  fillDailySeries,
  firstIssue,
  nextGameStatus,
  optionalNoteSchema,
  periodStart,
  rolesFor,
  suspendGameSchema,
  type AdminAuditAction,
  type AdminPermission,
  type DashboardPeriod,
  type SuspendGameInput,
} from './admin-logic';

/*
 * Back-office de l'équipe Dev AppStore (/admin).
 *
 * - Accès : `requirePlatformAdmin(roles?)` — un visiteur, un utilisateur sans ligne `platform_admins`, un compte désactivé
 *   ou un rôle insuffisant reçoit une **404** (et non une 403) : l'existence du back-office n'est pas révélée.
 * - Chaque action d'écriture vérifie elle-même l'accès (les Server Actions sont appelables sans passer par la page)
 *   et écrit une ligne `admin_audit_log` **dans la même transaction** que la modification : pas d'action sans trace.
 * - Les lectures ne renvoient jamais de secret (secret webhook, empreinte de clé API).
 */

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
type Exec = DB | Tx;

/** Erreur métier affichable à l'administrateur (les autres erreurs, dont la 404, se propagent). */
export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminError';
  }
}

export interface PlatformAdminContext {
  user: SessionUser;
  role: PlatformAdminRole;
}

/* ------------------------------------------------------------------------------------------------
 * Accès
 * ---------------------------------------------------------------------------------------------- */

/** Administrateur connecté (ou `null`), sans lever : pour l'affichage conditionnel. */
export async function getPlatformAdmin(): Promise<PlatformAdminContext | null> {
  const current = await getCurrentUser();
  if (!current) return null;
  const [row] = await db
    .select({ role: platformAdmins.role, suspendedAt: userSuspensions.createdAt })
    .from(platformAdmins)
    .leftJoin(userSuspensions, eq(userSuspensions.userId, platformAdmins.userId))
    .where(eq(platformAdmins.userId, current.id))
    .limit(1);
  if (!row || row.suspendedAt) return null;
  return { user: current, role: row.role };
}

/**
 * Exige un administrateur de la plateforme (avec l'un des `roles` si fourni).
 * Sinon `notFound()` : même réponse qu'une URL inexistante.
 */
export async function requirePlatformAdmin(roles?: readonly PlatformAdminRole[]): Promise<PlatformAdminContext> {
  const admin = await getPlatformAdmin();
  if (!admin || (roles && !roles.includes(admin.role))) notFound();
  return admin;
}

/** Raccourci : `requirePlatformAdmin(rolesFor(permission))`. */
export function requireAdminPermission(permission: AdminPermission): Promise<PlatformAdminContext> {
  return requirePlatformAdmin(rolesFor(permission));
}

/* ------------------------------------------------------------------------------------------------
 * Journal d'audit
 * ---------------------------------------------------------------------------------------------- */

export interface AuditEntryInput {
  adminId: string;
  action: AdminAuditAction;
  targetType: 'game' | 'order' | 'user' | 'studio';
  targetId: string;
  details?: Record<string, unknown>;
}

export async function logAdminAction(exec: Exec, entry: AuditEntryInput): Promise<string> {
  const id = newId('aud');
  await exec.insert(adminAuditLog).values({
    id,
    adminId: entry.adminId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    details: entry.details ?? {},
  });
  return id;
}

/* ------------------------------------------------------------------------------------------------
 * Modération des jeux
 * ---------------------------------------------------------------------------------------------- */

export interface AdminDeps {
  /** Transport e-mail (tests). Par défaut : `createMailerFromEnv()`. */
  mailer?: Mailer;
  now?: Date;
}

export interface ModerationResult {
  status: GameStatus;
  noticeId: string;
  notified: boolean;
}

const ACTION_REFUSED: Record<ModerationAction, string> = {
  approve: 'Seul un jeu en revue peut être approuvé.',
  suspend: 'Ce jeu est déjà suspendu.',
  reactivate: 'Seul un jeu suspendu peut être réactivé.',
};

async function moderateGame(
  admin: PlatformAdminContext,
  gameId: string,
  action: ModerationAction,
  extra: { ground?: string; reason?: string },
  deps: AdminDeps,
): Promise<ModerationResult> {
  const now = deps.now ?? new Date();
  const { noticeId, to } = await db.transaction(async (tx) => {
    const [g] = await tx.select({ id: games.id, status: games.status, studioId: games.studioId }).from(games).where(eq(games.id, gameId));
    if (!g) throw new AdminError('Jeu introuvable.');
    const to = nextGameStatus(g.status, action);
    if (!to) throw new AdminError(ACTION_REFUSED[action]);
    const [updated] = await tx
      .update(games)
      .set({ status: to, updatedAt: now })
      .where(and(eq(games.id, g.id), eq(games.status, g.status)))
      .returning({ id: games.id });
    if (!updated) throw new AdminError('Le statut du jeu vient de changer : rechargez la page.');
    const noticeId = newId('gmn');
    await tx.insert(gameModerationNotices).values({
      id: noticeId,
      gameId: g.id,
      adminId: admin.user.id,
      action,
      fromStatus: g.status,
      toStatus: to,
      ground: extra.ground ?? null,
      reason: extra.reason ?? null,
      createdAt: now,
    });
    await logAdminAction(tx, {
      adminId: admin.user.id,
      action: `game.${action}`,
      targetType: 'game',
      targetId: g.id,
      details: { from: g.status, to, studioId: g.studioId, noticeId, ...(extra.ground ? { ground: extra.ground } : {}), ...(extra.reason ? { reason: extra.reason } : {}) },
    });
    return { noticeId, to };
  });
  const notified = await notifyStudioOfModeration(noticeId, deps);
  return { status: to, noticeId, notified };
}

/** Revue approuvée : `review` → `live`. */
export async function approveGame(gameId: string, note?: string, deps: AdminDeps = {}): Promise<ModerationResult> {
  const admin = await requireAdminPermission('games.moderate');
  const parsed = optionalNoteSchema.safeParse(note);
  if (!parsed.success) throw new AdminError(firstIssue(parsed.error));
  return moderateGame(admin, gameId, 'approve', { reason: parsed.data }, deps);
}

/** Suspension (motif et fondement obligatoires, communiqués au studio — exigence P2B). */
export async function suspendGame(gameId: string, input: SuspendGameInput, deps: AdminDeps = {}): Promise<ModerationResult> {
  const admin = await requireAdminPermission('games.moderate');
  const parsed = suspendGameSchema.safeParse(input ?? {});
  if (!parsed.success) throw new AdminError(firstIssue(parsed.error));
  return moderateGame(admin, gameId, 'suspend', parsed.data, deps);
}

/** Réactivation : `suspended` → `live`. */
export async function reactivateGame(gameId: string, note?: string, deps: AdminDeps = {}): Promise<ModerationResult> {
  const admin = await requireAdminPermission('games.moderate');
  const parsed = optionalNoteSchema.safeParse(note);
  if (!parsed.success) throw new AdminError(firstIssue(parsed.error));
  return moderateGame(admin, gameId, 'reactivate', { reason: parsed.data }, deps);
}

let envMailer: Mailer | null = null;

/**
 * Envoie la décision aux responsables du studio (propriétaires et admins ; à défaut, tous les membres) et note le résultat
 * sur la notification. Ne lève jamais : la décision est déjà enregistrée et visible dans l'espace studio.
 */
export async function notifyStudioOfModeration(noticeId: string, deps: AdminDeps = {}): Promise<boolean> {
  try {
    const [n] = await db
      .select({
        id: gameModerationNotices.id,
        action: gameModerationNotices.action,
        ground: gameModerationNotices.ground,
        reason: gameModerationNotices.reason,
        createdAt: gameModerationNotices.createdAt,
        gameName: games.name,
        studioId: studios.id,
        studioName: studios.name,
      })
      .from(gameModerationNotices)
      .innerJoin(games, eq(games.id, gameModerationNotices.gameId))
      .innerJoin(studios, eq(studios.id, games.studioId))
      .where(eq(gameModerationNotices.id, noticeId));
    if (!n) return false;
    const members = await db
      .select({ email: user.email, role: studioMembers.role })
      .from(studioMembers)
      .innerJoin(user, eq(user.id, studioMembers.userId))
      .where(eq(studioMembers.studioId, n.studioId));
    const leaders = members.filter((m) => m.role === 'owner' || m.role === 'admin');
    const recipients = [...new Set((leaders.length ? leaders : members).map((m) => m.email))];
    if (!recipients.length) {
      await db.update(gameModerationNotices).set({ notifyError: 'Aucun destinataire dans le studio.' }).where(eq(gameModerationNotices.id, noticeId));
      return false;
    }
    const content = moderationEmail(
      { action: n.action, studioName: n.studioName, gameName: n.gameName, ground: n.ground, reason: n.reason, decidedAt: n.createdAt, reference: n.id },
      contextFromEnv(),
    );
    const mailer = deps.mailer ?? (envMailer ??= createMailerFromEnv());
    for (const to of recipients) await sendEmail(mailer, to, content);
    await db
      .update(gameModerationNotices)
      .set({ notifiedTo: recipients.join(',').slice(0, 2000), notifiedAt: new Date(), notifyError: null })
      .where(eq(gameModerationNotices.id, noticeId));
    return true;
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    console.error(`[admin] notification de modération ${noticeId} : ${message}`);
    await db
      .update(gameModerationNotices)
      .set({ notifyError: message })
      .where(eq(gameModerationNotices.id, noticeId))
      .catch(() => {});
    return false;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Commandes : relance de livraison
 * ---------------------------------------------------------------------------------------------- */

export interface RetryResult {
  deliveryId: string;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
}

/** Remet la livraison de la commande en file (pending/failed → pending, due maintenant) puis appelle `dispatchDelivery`. */
export async function retryOrderDelivery(orderId: string): Promise<RetryResult> {
  const admin = await requireAdminPermission('orders.retry_delivery');
  const [d] = await db.select().from(deliveries).where(eq(deliveries.orderId, orderId));
  if (!d) throw new AdminError('Aucune livraison n’existe pour cette commande (commande non payée ?).');
  if (d.status !== 'pending' && d.status !== 'failed') throw new AdminError('Cette livraison a déjà abouti : rien à relancer.');
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(deliveries)
      .set({ status: 'pending', nextAttemptAt: new Date() })
      .where(and(eq(deliveries.id, d.id), inArray(deliveries.status, ['pending', 'failed'])))
      .returning({ id: deliveries.id });
    if (!row) throw new AdminError('La livraison vient d’aboutir : rien à relancer.');
    await logAdminAction(tx, {
      adminId: admin.user.id,
      action: 'order.retry_delivery',
      targetType: 'order',
      targetId: orderId,
      details: { deliveryId: d.id, previousStatus: d.status, attempts: d.attempts, lastError: d.lastError },
    });
  });
  try {
    await dispatchDelivery(d.id);
  } catch (e) {
    throw new AdminError(`La relance a échoué : ${e instanceof Error ? e.message : String(e)}`);
  }
  const [after] = await db
    .select({ status: deliveries.status, attempts: deliveries.attempts, lastError: deliveries.lastError })
    .from(deliveries)
    .where(eq(deliveries.id, d.id));
  return { deliveryId: d.id, status: after?.status ?? 'pending', attempts: after?.attempts ?? d.attempts, lastError: after?.lastError ?? null };
}

/* ------------------------------------------------------------------------------------------------
 * Utilisateurs : désactivation
 * ---------------------------------------------------------------------------------------------- */

/** Désactive un compte (motif obligatoire) et révoque toutes ses sessions. */
export async function disableUser(userId: string, input: { reason?: unknown }): Promise<{ revokedSessions: number }> {
  const admin = await requireAdminPermission('users.disable');
  const parsed = disableUserSchema.safeParse(input ?? {});
  if (!parsed.success) throw new AdminError(firstIssue(parsed.error));
  if (userId === admin.user.id) throw new AdminError('Vous ne pouvez pas désactiver votre propre compte.');
  const [target] = await db
    .select({ id: user.id, email: user.email, adminRole: platformAdmins.role })
    .from(user)
    .leftJoin(platformAdmins, eq(platformAdmins.userId, user.id))
    .where(eq(user.id, userId));
  if (!target) throw new AdminError('Utilisateur introuvable.');
  if (target.adminRole && admin.role !== 'superadmin') throw new AdminError('Seul un superadmin peut désactiver un administrateur de la plateforme.');
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(userSuspensions)
      .values({ userId, adminId: admin.user.id, reason: parsed.data.reason })
      .onConflictDoNothing()
      .returning({ userId: userSuspensions.userId });
    if (!inserted.length) throw new AdminError('Ce compte est déjà désactivé.');
    const revoked = await tx.delete(session).where(eq(session.userId, userId)).returning({ id: session.id });
    await logAdminAction(tx, {
      adminId: admin.user.id,
      action: 'user.disable',
      targetType: 'user',
      targetId: userId,
      details: { reason: parsed.data.reason, revokedSessions: revoked.length, ...(target.adminRole ? { platformRole: target.adminRole } : {}) },
    });
    return { revokedSessions: revoked.length };
  });
}

/** Réactive un compte désactivé. */
export async function enableUser(userId: string, note?: string): Promise<void> {
  const admin = await requireAdminPermission('users.disable');
  const parsed = optionalNoteSchema.safeParse(note);
  if (!parsed.success) throw new AdminError(firstIssue(parsed.error));
  await db.transaction(async (tx) => {
    const removed = await tx.delete(userSuspensions).where(eq(userSuspensions.userId, userId)).returning({ reason: userSuspensions.reason });
    if (!removed.length) throw new AdminError('Ce compte n’est pas désactivé.');
    await logAdminAction(tx, {
      adminId: admin.user.id,
      action: 'user.enable',
      targetType: 'user',
      targetId: userId,
      details: { previousReason: removed[0]!.reason, ...(parsed.data ? { note: parsed.data } : {}) },
    });
  });
}

/* ------------------------------------------------------------------------------------------------
 * Lectures (les pages appellent requireAdminPermission avant)
 * ---------------------------------------------------------------------------------------------- */

const sumInt = (col: AnyColumn) => sql<number>`coalesce(sum(${col}), 0)`.mapWith(Number);

export interface DashboardData {
  period: DashboardPeriod;
  since: Date;
  /** Ventes par devise (la plus grosse en premier). */
  sales: { currency: Currency; gmvCents: number; feeCents: number; orders: number; takeRateBps: number }[];
  ordersCount: number;
  failedDeliveries: number;
  openFailedDeliveries: number;
  gamesInReview: number;
  liveGames: number;
  suspendedGames: number;
  daily: { currency: Currency; points: { day: string; cents: number }[] };
  topGames: { id: string; name: string; currency: Currency; gmvCents: number; orders: number }[];
}

export async function getDashboard(period: DashboardPeriod, now: Date = new Date()): Promise<DashboardData> {
  const since = periodStart(period, now);
  const paidInPeriod = and(eq(orders.status, 'paid'), gte(orders.paidAt, since));
  const [salesRows, failed, openFailed, statusRows, topGames] = await Promise.all([
    db
      .select({ currency: orders.currency, gmv: sumInt(orders.amountCents), fee: sumInt(orders.platformFeeCents), n: count() })
      .from(orders)
      .where(paidInPeriod)
      .groupBy(orders.currency),
    db.select({ n: count() }).from(deliveries).where(and(eq(deliveries.status, 'failed'), gte(deliveries.createdAt, since))),
    db.select({ n: count() }).from(deliveries).where(eq(deliveries.status, 'failed')),
    db.select({ status: games.status, n: count() }).from(games).groupBy(games.status),
    db
      .select({ id: games.id, name: games.name, currency: orders.currency, gmv: sumInt(orders.amountCents), n: count() })
      .from(orders)
      .innerJoin(games, eq(games.id, orders.gameId))
      .where(paidInPeriod)
      .groupBy(games.id, games.name, orders.currency)
      .orderBy(desc(sumInt(orders.amountCents)))
      .limit(5),
  ]);
  const sales = salesRows
    .map((r) => ({ currency: r.currency, gmvCents: r.gmv, feeCents: r.fee, orders: r.n, takeRateBps: effectiveTakeRateBps(r.gmv, r.fee) }))
    .sort((a, b) => b.gmvCents - a.gmvCents);
  const mainCurrency: Currency = sales[0]?.currency ?? 'EUR';
  const dayExpr = sql<string>`to_char(${orders.paidAt}, 'YYYY-MM-DD')`;
  const dailyRows = await db
    .select({ day: dayExpr, cents: sumInt(orders.amountCents) })
    .from(orders)
    .where(and(paidInPeriod, eq(orders.currency, mainCurrency)))
    .groupBy(dayExpr);
  const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, r.n])) as Partial<Record<GameStatus, number>>;
  return {
    period,
    since,
    sales,
    ordersCount: sales.reduce((s, r) => s + r.orders, 0),
    failedDeliveries: failed[0]?.n ?? 0,
    openFailedDeliveries: openFailed[0]?.n ?? 0,
    gamesInReview: byStatus.review ?? 0,
    liveGames: byStatus.live ?? 0,
    suspendedGames: byStatus.suspended ?? 0,
    daily: { currency: mainCurrency, points: fillDailySeries(period, dailyRows, now) },
    topGames: topGames.map((g) => ({ id: g.id, name: g.name, currency: g.currency, gmvCents: g.gmv, orders: g.n })),
  };
}

/* Jeux ------------------------------------------------------------------------------------------- */

export async function listGamesForAdmin(filters: { status?: GameStatus | null; q?: string }) {
  const conds = [];
  if (filters.status) conds.push(eq(games.status, filters.status));
  if (filters.q) {
    const like = `%${escapeLike(filters.q)}%`;
    conds.push(or(eq(games.id, filters.q), ilike(games.name, like), ilike(games.slug, like), ilike(studios.name, like)));
  }
  const itemCount = db.$with('item_count').as(db.select({ gameId: items.gameId, itemsN: count().as('items_n') }).from(items).where(eq(items.active, true)).groupBy(items.gameId));
  const [rows, statusRows] = await Promise.all([
    db
      .with(itemCount)
      .select({
        id: games.id,
        name: games.name,
        slug: games.slug,
        status: games.status,
        iconUrl: games.iconUrl,
        category: games.category,
        updatedAt: games.updatedAt,
        studioId: studios.id,
        studioName: studios.name,
        items: sql<number>`coalesce(${itemCount.itemsN}, 0)`.mapWith(Number),
      })
      .from(games)
      .innerJoin(studios, eq(studios.id, games.studioId))
      .leftJoin(itemCount, eq(itemCount.gameId, games.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(sql`case ${games.status} when 'review' then 0 when 'suspended' then 1 when 'live' then 2 else 3 end`, desc(games.updatedAt))
      .limit(200),
    db.select({ status: games.status, n: count() }).from(games).groupBy(games.status),
  ]);
  const counts = Object.fromEntries(statusRows.map((r) => [r.status, r.n])) as Partial<Record<GameStatus, number>>;
  return { rows, counts };
}

export async function getGameForAdmin(gameId: string, now: Date = new Date()) {
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      slug: games.slug,
      subtitle: games.subtitle,
      category: games.category,
      publisherName: games.publisherName,
      description: games.description,
      iconUrl: games.iconUrl,
      status: games.status,
      currency: games.currency,
      linkMethods: games.linkMethods,
      playerLookupUrl: games.playerLookupUrl,
      webhookUrl: games.webhookUrl,
      apiKeyPrefix: games.apiKeyPrefix,
      createdAt: games.createdAt,
      updatedAt: games.updatedAt,
      studioId: studios.id,
      studioName: studios.name,
      studioStripeAccountId: studios.stripeAccountId,
      studioChargesEnabled: studios.stripeChargesEnabled,
    })
    .from(games)
    .innerJoin(studios, eq(studios.id, games.studioId))
    .where(eq(games.id, gameId));
  if (!game) return null;
  const since30 = periodStart(30, now);
  const [itemRows, sales, deliveryRows, notices, audit] = await Promise.all([
    db
      .select({ id: items.id, productId: items.productId, title: items.title, type: items.type, priceCents: items.priceCents, active: items.active })
      .from(items)
      .where(eq(items.gameId, gameId))
      .orderBy(items.position, items.createdAt),
    db
      .select({ gmv: sumInt(orders.amountCents), n: count() })
      .from(orders)
      .where(and(eq(orders.gameId, gameId), eq(orders.status, 'paid'), gte(orders.paidAt, since30))),
    db.select({ status: deliveries.status, n: count() }).from(deliveries).where(eq(deliveries.gameId, gameId)).groupBy(deliveries.status),
    db.select().from(gameModerationNotices).where(eq(gameModerationNotices.gameId, gameId)).orderBy(desc(gameModerationNotices.createdAt)).limit(20),
    listAuditEntries({ targetType: 'game', targetId: gameId, limit: 10 }),
  ]);
  const deliveriesByStatus = Object.fromEntries(deliveryRows.map((r) => [r.status, r.n])) as Partial<Record<DeliveryStatus, number>>;
  return { game, items: itemRows, sales30: { gmvCents: sales[0]?.gmv ?? 0, orders: sales[0]?.n ?? 0 }, deliveriesByStatus, notices, audit: audit.rows };
}

/* Studios ---------------------------------------------------------------------------------------- */

export async function listStudiosForAdmin(q?: string) {
  const memberCount = db.$with('member_count').as(db.select({ studioId: studioMembers.studioId, membersN: count().as('members_n') }).from(studioMembers).groupBy(studioMembers.studioId));
  const gameCount = db.$with('game_count').as(db.select({ studioId: games.studioId, gamesN: count().as('games_n') }).from(games).groupBy(games.studioId));
  const like = q ? `%${escapeLike(q)}%` : null;
  return db
    .with(memberCount, gameCount)
    .select({
      id: studios.id,
      name: studios.name,
      slug: studios.slug,
      stripeAccountId: studios.stripeAccountId,
      chargesEnabled: studios.stripeChargesEnabled,
      createdAt: studios.createdAt,
      members: sql<number>`coalesce(${memberCount.membersN}, 0)`.mapWith(Number),
      games: sql<number>`coalesce(${gameCount.gamesN}, 0)`.mapWith(Number),
    })
    .from(studios)
    .leftJoin(memberCount, eq(memberCount.studioId, studios.id))
    .leftJoin(gameCount, eq(gameCount.studioId, studios.id))
    .where(like && q ? or(eq(studios.id, q), ilike(studios.name, like), ilike(studios.slug, like)) : undefined)
    .orderBy(desc(studios.createdAt))
    .limit(200);
}

export async function getStudioForAdmin(studioId: string, now: Date = new Date()) {
  const [studio] = await db.select().from(studios).where(eq(studios.id, studioId));
  if (!studio) return null;
  const [members, gameRows, sales] = await Promise.all([
    db
      .select({ userId: user.id, name: user.name, email: user.email, role: studioMembers.role, joinedAt: studioMembers.createdAt, disabledAt: userSuspensions.createdAt })
      .from(studioMembers)
      .innerJoin(user, eq(user.id, studioMembers.userId))
      .leftJoin(userSuspensions, eq(userSuspensions.userId, user.id))
      .where(eq(studioMembers.studioId, studioId))
      .orderBy(studioMembers.createdAt),
    db.select({ id: games.id, name: games.name, status: games.status, iconUrl: games.iconUrl }).from(games).where(eq(games.studioId, studioId)).orderBy(games.name),
    db
      .select({ currency: orders.currency, gmv: sumInt(orders.amountCents), fee: sumInt(orders.platformFeeCents), n: count() })
      .from(orders)
      .innerJoin(games, eq(games.id, orders.gameId))
      .where(and(eq(games.studioId, studioId), eq(orders.status, 'paid'), gte(orders.paidAt, periodStart(30, now))))
      .groupBy(orders.currency),
  ]);
  return { studio, members, games: gameRows, sales30: sales.map((s) => ({ currency: s.currency, gmvCents: s.gmv, feeCents: s.fee, orders: s.n })) };
}

/* Commandes -------------------------------------------------------------------------------------- */

/**
 * Recherche par id de commande, e-mail de l'acheteur (partiel) ou player_id ; sans saisie : les plus récentes.
 * `deliveryStatus` restreint aux commandes dont la livraison a ce statut (ex. « failed » depuis le tableau de bord).
 */
export async function searchOrdersForAdmin(q: string, opts: { deliveryStatus?: DeliveryStatus | null; limit?: number } = {}) {
  const filters = [];
  if (q) {
    const conds = [eq(orders.id, q), eq(orders.playerId, q), eq(orders.stripePaymentIntentId, q)];
    if (q.length >= 3) conds.push(ilike(user.email, `%${escapeLike(q)}%`));
    filters.push(or(...conds));
  }
  if (opts.deliveryStatus) filters.push(eq(deliveries.status, opts.deliveryStatus));
  const where = filters.length ? and(...filters) : undefined;
  const limit = opts.limit ?? PAGE_SIZE;
  return db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      status: orders.status,
      amountCents: orders.amountCents,
      currency: orders.currency,
      itemTitle: orders.itemTitle,
      playerId: orders.playerId,
      email: user.email,
      gameId: games.id,
      gameName: games.name,
      deliveryStatus: deliveries.status,
    })
    .from(orders)
    .innerJoin(user, eq(user.id, orders.userId))
    .innerJoin(games, eq(games.id, orders.gameId))
    .leftJoin(deliveries, eq(deliveries.orderId, orders.id))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}

export async function getOrderForAdmin(orderId: string) {
  const [row] = await db
    .select({
      order: orders,
      buyer: { id: user.id, email: user.email, name: user.name },
      game: { id: games.id, name: games.name, webhookUrl: games.webhookUrl, studioId: games.studioId },
    })
    .from(orders)
    .innerJoin(user, eq(user.id, orders.userId))
    .innerJoin(games, eq(games.id, orders.gameId))
    .where(eq(orders.id, orderId));
  if (!row) return null;
  const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, orderId));
  const attempts = delivery
    ? await db.select().from(webhookAttempts).where(eq(webhookAttempts.deliveryId, delivery.id)).orderBy(desc(webhookAttempts.createdAt)).limit(50)
    : [];
  const audit = await listAuditEntries({ targetType: 'order', targetId: orderId, limit: 10 });
  return { ...row, delivery: delivery ?? null, attempts, audit: audit.rows };
}

/* Utilisateurs ----------------------------------------------------------------------------------- */

export async function searchUsersForAdmin(q: string, limit = PAGE_SIZE) {
  const like = `%${escapeLike(q)}%`;
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      disabledAt: userSuspensions.createdAt,
      adminRole: platformAdmins.role,
    })
    .from(user)
    .leftJoin(userSuspensions, eq(userSuspensions.userId, user.id))
    .leftJoin(platformAdmins, eq(platformAdmins.userId, user.id))
    .where(q ? or(eq(user.id, q), ilike(user.email, like), ilike(user.name, like)) : undefined)
    .orderBy(desc(user.createdAt))
    .limit(limit);
}

export async function getUserForAdmin(userId: string) {
  const [u] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      adminRole: platformAdmins.role,
      disabledAt: userSuspensions.createdAt,
      disabledReason: userSuspensions.reason,
      disabledBy: userSuspensions.adminId,
    })
    .from(user)
    .leftJoin(userSuspensions, eq(userSuspensions.userId, user.id))
    .leftJoin(platformAdmins, eq(platformAdmins.userId, user.id))
    .where(eq(user.id, userId));
  if (!u) return null;
  const [memberships, orderStats, links, sessions, audit] = await Promise.all([
    db
      .select({ studioId: studios.id, studioName: studios.name, role: studioMembers.role })
      .from(studioMembers)
      .innerJoin(studios, eq(studios.id, studioMembers.studioId))
      .where(eq(studioMembers.userId, userId)),
    db.select({ n: count() }).from(orders).where(eq(orders.userId, userId)),
    db.select({ n: count() }).from(gameLinks).where(eq(gameLinks.userId, userId)),
    db.select({ n: count() }).from(session).where(eq(session.userId, userId)),
    listAuditEntries({ targetType: 'user', targetId: userId, limit: 10 }),
  ]);
  return { user: u, memberships, orders: orderStats[0]?.n ?? 0, links: links[0]?.n ?? 0, sessions: sessions[0]?.n ?? 0, audit: audit.rows };
}

/* Journal ---------------------------------------------------------------------------------------- */

export async function listAuditEntries(filters: { action?: string; targetType?: string; targetId?: string; adminId?: string; page?: number; limit?: number }) {
  const limit = filters.limit ?? PAGE_SIZE;
  const page = filters.page ?? 1;
  const conds = [];
  if (filters.action) conds.push(eq(adminAuditLog.action, filters.action));
  if (filters.targetType) conds.push(eq(adminAuditLog.targetType, filters.targetType));
  if (filters.targetId) conds.push(eq(adminAuditLog.targetId, filters.targetId));
  if (filters.adminId) conds.push(eq(adminAuditLog.adminId, filters.adminId));
  const rows = await db
    .select({
      id: adminAuditLog.id,
      adminId: adminAuditLog.adminId,
      adminEmail: user.email,
      action: adminAuditLog.action,
      targetType: adminAuditLog.targetType,
      targetId: adminAuditLog.targetId,
      details: adminAuditLog.details,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .leftJoin(user, eq(user.id, adminAuditLog.adminId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
    .limit(limit + 1)
    .offset((page - 1) * limit);
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit, page };
}

/** Administrateurs (filtre du journal). */
export async function listPlatformAdmins() {
  return db
    .select({ userId: platformAdmins.userId, role: platformAdmins.role, email: user.email, name: user.name })
    .from(platformAdmins)
    .innerJoin(user, eq(user.id, platformAdmins.userId))
    .orderBy(user.email);
}
