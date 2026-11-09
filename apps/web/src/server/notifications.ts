import 'server-only';
import { after } from 'next/server';
import { newId, type Currency, type StudioRole } from '@wolleen/core';
import {
  and,
  db,
  deliveries,
  desc,
  eq,
  gameLinks,
  games,
  gte,
  inArray,
  lt,
  notificationsSent,
  or,
  orders,
  sql,
  studioMembers,
  studios,
  user,
  webhookAttempts,
  type DB,
  type NotificationKind,
} from '@wolleen/db';
import {
  contextFromEnv,
  createConsoleMailer,
  createMailerFromEnv,
  deliveryFailedEmail,
  playerWelcomeEmail,
  purchaseDeliveredEmail,
  purchaseReceiptEmail,
  resolveContext,
  sendEmail,
  studioDeliveryAlertEmail,
  studioWeeklyReportEmail,
  studioWelcomeEmail,
  type EmailContent,
  type EmailContext,
  type Mailer,
  type ResolvedContext,
  type WeeklyGameStats,
  withdrawalAcknowledgementEmail,
} from '@wolleen/emails';
import { env } from '@/env';
import { CGV_VERSION } from '@/lib/legal-versions';

/**
 * E-mails transactionnels (propriétaire : tâche « notifications »).
 *
 * Toutes les fonctions sont :
 * - **idempotentes** : table `notifications_sent`, clé unique (kind, ref_id). Un e-mail déjà envoyé n'est jamais renvoyé ;
 *   un envoi en échec peut être retenté en rappelant la fonction ;
 * - **sans effet sur l'appelant** : elles ne lèvent jamais. Une erreur (transport, base, données) est journalisée et
 *   renvoyée sous la forme `{ ok: false, error }`. On peut donc les appeler sans `try` depuis un webhook Stripe ou une livraison.
 *
 * Transport : `createMailerFromEnv()` de @wolleen/emails (console + `.data/mails` en dev, Resend si `RESEND_API_KEY`).
 */

/**
 * Libellé exact de la case cochée au checkout (BuyButton), repris mot pour mot dans le reçu (support durable de la
 * renonciation au droit de rétractation). Ré-exporté par payments.ts.
 */
export const WITHDRAWAL_WAIVER_LABEL = 'Je demande la livraison immédiate et renonce à mon droit de rétractation';

/**
 * Lance un envoi sans faire attendre l'appelant (livraison, ack du SDK, inscription). Dans une requête Next.js, la
 * tâche passe par `after()` : elle s'exécute après la réponse, sans être coupée par l'hébergeur (serverless). Hors
 * requête (tests, boucle de relance en dev, scripts), elle part immédiatement en arrière-plan. Ne lève jamais.
 */
export function runInBackground(label: string, task: () => Promise<unknown>): void {
  const run = () =>
    task().then(
      () => undefined,
      (e: unknown) => console.error(`[notifications] ${label} : ${errorMessage(e)}`),
    );
  try {
    after(run);
  } catch {
    void run();
  }
}

export type NotificationResult =
  | { ok: true; status: 'sent'; recipients: string[] }
  | { ok: true; status: 'skipped'; reason: SkipReason }
  | { ok: false; error: string };

export type SkipReason =
  | 'already_sent'
  | 'not_found'
  | 'not_paid'
  | 'not_delivered'
  | 'not_failed'
  | 'not_refunded'
  | 'no_recipient'
  | 'no_activity';

export interface NotifyDeps {
  database?: DB;
  mailer?: Mailer;
  context?: Partial<EmailContext>;
  /** Horloge (tests). */
  now?: Date;
  /** Journal des erreurs (par défaut `console.error`). */
  log?: (message: string) => void;
}

/** Un envoi `sending` plus vieux que ce délai est considéré comme abandonné (crash) et peut être repris. */
export const STALE_SENDING_MS = 10 * 60_000;
/** Fenêtre de regroupement des alertes « livraisons en échec » envoyées au studio (une par jeu et par fenêtre). */
export const STUDIO_ALERT_WINDOW_MS = 60 * 60_000;
/** Ancienneté maximale des livraisons listées dans une alerte studio. */
export const STUDIO_ALERT_LOOKBACK_MS = 7 * 24 * 60 * 60_000;
const ALERT_MAX_LISTED = 10;
const WEEK_MS = 7 * 24 * 60 * 60_000;

/** Rôles destinataires des e-mails studio. */
const ALERT_ROLES: StudioRole[] = ['owner', 'admin', 'developer'];
const REPORT_ROLES: StudioRole[] = ['owner', 'admin', 'finance'];
const WELCOME_ROLES: StudioRole[] = ['owner'];

/* ------------------------------------------------------------------------------------------------
 * Infrastructure
 * ---------------------------------------------------------------------------------------------- */

let envMailer: Mailer | null = null;
function defaultMailer(): Mailer {
  // Sous vitest, les e-mails déclenchés par les branchements (paiement, livraison, inscription) ne sont ni écrits
  // sur disque ni journalisés ; les tests qui vérifient un envoi injectent leur propre `mailer`.
  return (envMailer ??= process.env.VITEST === 'true' ? createConsoleMailer({ dir: false, log: () => {} }) : createMailerFromEnv());
}

interface Ctx {
  database: DB;
  mailer: () => Mailer;
  context: ResolvedContext;
  now: Date;
  log: (message: string) => void;
}

function resolveDeps(deps: NotifyDeps): Ctx {
  const fromEnv = contextFromEnv();
  return {
    database: deps.database ?? db,
    mailer: () => deps.mailer ?? defaultMailer(),
    context: deps.context ? resolveContext({ ...fromEnv, supportUrl: undefined, ...deps.context }) : fromEnv,
    now: deps.now ?? new Date(),
    log: deps.log ?? ((m) => console.error(m)),
  };
}

function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 500);
}

interface Outgoing {
  to: string;
  content: EmailContent;
}

type Prepared = { messages: Outgoing[] } | { skip: SkipReason };

const skip = (reason: SkipReason): Prepared => ({ skip: reason });

/**
 * Types d'envoi : ceux du schéma + l'accusé de rétractation (colonne `kind` en texte libre : aucun changement de
 * schéma nécessaire ; à reporter dans `NotificationKind` de packages/db quand le schéma sera retouché).
 */
type Kind = NotificationKind;

/** Réserve (kind, refId). `false` si déjà envoyé ou en cours d'envoi. */
async function claim(c: Ctx, kindArg: Kind, refId: string, recipients: string[]): Promise<boolean> {
  const kind = kindArg as NotificationKind;
  const recipient = recipients.join(',').slice(0, 2000);
  const inserted = await c.database
    .insert(notificationsSent)
    .values({ id: newId('ntf'), kind, refId, recipient, status: 'sending', createdAt: c.now, updatedAt: c.now })
    .onConflictDoNothing()
    .returning({ id: notificationsSent.id });
  if (inserted.length) return true;
  const staleBefore = new Date(c.now.getTime() - STALE_SENDING_MS);
  const retaken = await c.database
    .update(notificationsSent)
    .set({ status: 'sending', recipient, error: null, attempts: sql`${notificationsSent.attempts} + 1`, updatedAt: c.now })
    .where(
      and(
        eq(notificationsSent.kind, kind),
        eq(notificationsSent.refId, refId),
        or(eq(notificationsSent.status, 'failed'), and(eq(notificationsSent.status, 'sending'), lt(notificationsSent.updatedAt, staleBefore))),
      ),
    )
    .returning({ id: notificationsSent.id });
  return retaken.length > 0;
}

/**
 * Charge les données (`prepare`), réserve la clé d'idempotence, envoie, puis enregistre le résultat.
 * Les cas « pas encore » (livraison non terminée, commande non payée…) ne réservent rien : un appel ultérieur pourra envoyer.
 */
async function notifyOnce(c: Ctx, kindArg: Kind, refId: string, prepare: () => Promise<Prepared>): Promise<NotificationResult> {
  const kind = kindArg as NotificationKind;
  let claimed = false;
  try {
    const prepared = await prepare();
    if ('skip' in prepared) return { ok: true, status: 'skipped', reason: prepared.skip };
    const messages = dedupeRecipients(prepared.messages);
    if (!messages.length) return { ok: true, status: 'skipped', reason: 'no_recipient' };
    const recipients = messages.map((m) => m.to);
    if (!(await claim(c, kind, refId, recipients))) return { ok: true, status: 'skipped', reason: 'already_sent' };
    claimed = true;

    const sent: string[] = [];
    const providerIds: string[] = [];
    const errors: string[] = [];
    for (const m of messages) {
      try {
        const res = await sendEmail(c.mailer(), m.to, m.content);
        sent.push(m.to);
        providerIds.push(res.id);
      } catch (err) {
        errors.push(errorMessage(err));
      }
    }
    const ok = sent.length > 0;
    if (ok) claimed = false; // déjà envoyé : ne jamais libérer la clé, même si l'écriture du statut échoue
    await c.database
      .update(notificationsSent)
      .set({
        status: ok ? 'sent' : 'failed',
        providerId: providerIds.join(',').slice(0, 2000) || null,
        error: errors.length ? errors.join(' | ').slice(0, 1000) : null,
        updatedAt: new Date(),
      })
      .where(and(eq(notificationsSent.kind, kind), eq(notificationsSent.refId, refId)));
    if (errors.length) c.log(`[notifications] ${kind} ${refId} : ${errors.length} envoi(s) en échec — ${errors[0]}`);
    return ok ? { ok: true, status: 'sent', recipients: sent } : { ok: false, error: errors[0] ?? 'envoi impossible' };
  } catch (err) {
    const error = errorMessage(err);
    c.log(`[notifications] ${kind} ${refId} : ${error}`);
    if (claimed) {
      // Libère notre réservation pour permettre une nouvelle tentative (au pire, elle expire après STALE_SENDING_MS).
      try {
        await c.database
          .update(notificationsSent)
          .set({ status: 'failed', error, updatedAt: new Date() })
          .where(and(eq(notificationsSent.kind, kind), eq(notificationsSent.refId, refId), eq(notificationsSent.status, 'sending')));
      } catch {
        /* ignoré */
      }
    }
    return { ok: false, error };
  }
}

function dedupeRecipients(messages: Outgoing[]): Outgoing[] {
  const seen = new Set<string>();
  return messages.filter((m) => {
    const key = m.to.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function link(c: Ctx, path: string) {
  return `${c.context.appUrl}${path}`;
}

async function studioRecipients(c: Ctx, studioId: string, roles: StudioRole[]) {
  return c.database
    .select({ email: user.email, name: user.name })
    .from(studioMembers)
    .innerJoin(user, eq(user.id, studioMembers.userId))
    .where(and(eq(studioMembers.studioId, studioId), inArray(studioMembers.role, roles)));
}

/** Commande + acheteur + jeu + studio + compte de jeu lié. */
async function loadOrder(c: Ctx, orderId: string) {
  const [row] = await c.database
    .select({ order: orders, buyer: { email: user.email, name: user.name }, game: { id: games.id, name: games.name }, studio: { name: studios.name } })
    .from(orders)
    .innerJoin(user, eq(user.id, orders.userId))
    .innerJoin(games, eq(games.id, orders.gameId))
    .innerJoin(studios, eq(studios.id, games.studioId))
    .where(eq(orders.id, orderId));
  if (!row) return null;
  const [gameLink] = await c.database
    .select({ playerId: gameLinks.playerId, playerName: gameLinks.playerName })
    .from(gameLinks)
    .where(and(eq(gameLinks.userId, row.order.userId), eq(gameLinks.gameId, row.order.gameId)));
  const playerName = gameLink && gameLink.playerId === row.order.playerId ? (gameLink.playerName ?? undefined) : undefined;
  return { ...row, gameAccount: { playerId: row.order.playerId, playerName } };
}

const itemOf = (o: { itemTitle: string; quantity: number }) => ({ name: o.itemTitle, quantity: o.quantity > 1 ? o.quantity : undefined });

/* ------------------------------------------------------------------------------------------------
 * Joueur
 * ---------------------------------------------------------------------------------------------- */

/**
 * Version des CGV en vigueur (WOLLEEN_CGV_VERSION, ancien nom CGV_VERSION) — repli du reçu pour une commande
 * antérieure à l'enregistrement de la preuve de consentement (la version acceptée est stockée sur la commande).
 */
export function cgvVersion() {
  return env.WOLLEEN_CGV_VERSION || env.CGV_VERSION || CGV_VERSION;
}

/**
 * Reçu d'achat + confirmation de la renonciation au droit de rétractation (support durable).
 * À appeler quand la commande passe à `paid` (`markOrderPaid`).
 */
export function sendPurchaseReceipt(orderId: string, deps: NotifyDeps = {}): Promise<NotificationResult> {
  const c = resolveDeps(deps);
  return notifyOnce(c, 'purchase_receipt', orderId, async () => {
    const data = await loadOrder(c, orderId);
    if (!data) return skip('not_found');
    const { order, buyer, game, studio, gameAccount } = data;
    if (order.status !== 'paid' && order.status !== 'refunded') return skip('not_paid');
    const paidAt = order.paidAt ?? c.now;
    const content = purchaseReceiptEmail(
      {
        playerName: buyer.name || undefined,
        orderId: order.id,
        paidAt,
        item: itemOf(order),
        amountCents: order.amountCents,
        currency: order.currency,
        gameName: game.name,
        gameAccount,
        seller: { name: studio.name },
        consent: {
          // Preuve enregistrée au checkout (payments.createCheckout) : horodatage de la case cochée, version des CGV
          // acceptées et libellé affiché. Repli sur la date de la commande pour les commandes plus anciennes.
          acceptedAt: order.withdrawalWaiverAt ?? order.createdAt,
          cgvVersion: order.termsVersion ?? cgvVersion(),
          cgvUrl: env.CGV_URL || link(c, '/legal/cgv'),
          waiverText: WITHDRAWAL_WAIVER_LABEL,
        },
        purchasesUrl: link(c, '/account/purchases'),
      },
      c.context,
    );
    return { messages: [{ to: buyer.email, content }] };
  });
}

async function loadDelivery(c: Ctx, deliveryId: string) {
  const [d] = await c.database.select().from(deliveries).where(eq(deliveries.id, deliveryId));
  if (!d) return null;
  const o = await loadOrder(c, d.orderId);
  return o ? { delivery: d, ...o } : null;
}

/** Confirmation « votre achat est arrivé dans le jeu ». À appeler quand la livraison passe à `delivered` / `acknowledged`. */
export function sendPurchaseDelivered(deliveryId: string, deps: NotifyDeps = {}): Promise<NotificationResult> {
  const c = resolveDeps(deps);
  return notifyOnce(c, 'purchase_delivered', deliveryId, async () => {
    const data = await loadDelivery(c, deliveryId);
    if (!data) return skip('not_found');
    const { delivery, order, buyer, game, gameAccount } = data;
    if (delivery.status !== 'delivered' && delivery.status !== 'acknowledged') return skip('not_delivered');
    const content = purchaseDeliveredEmail(
      {
        playerName: buyer.name || undefined,
        orderId: order.id,
        item: itemOf(order),
        gameName: game.name,
        gameAccount,
        deliveredAt: delivery.deliveredAt ?? delivery.acknowledgedAt ?? c.now,
        purchasesUrl: link(c, '/account/purchases'),
      },
      c.context,
    );
    return { messages: [{ to: buyer.email, content }] };
  });
}

export interface WithdrawalAcknowledgementOptions extends NotifyDeps {
  /** Date de la demande de rétractation (défaut : `orders.refundedAt`, sinon maintenant). */
  requestedAt?: Date;
  /** Délai de remboursement annoncé, en jours (défaut 14, plafonné à 14). */
  refundDays?: number;
  /** Remboursement simulé (mode simulation, sans Stripe). Défaut : commande sans paiement Stripe. */
  simulated?: boolean;
}

/**
 * Accusé de réception de la rétractation sur support durable (directive 2023/2673, art. L221-21) : commande, article,
 * montant remboursé, date de la demande, délai de remboursement. Appelé par `withdrawOrder` (withdrawal.ts) une fois la
 * commande `refunded`, en arrière-plan. Idempotent par commande ; ne lève jamais.
 */
export function sendWithdrawalAcknowledgement(orderId: string, opts: WithdrawalAcknowledgementOptions = {}): Promise<NotificationResult> {
  const c = resolveDeps(opts);
  return notifyOnce(c, 'withdrawal_acknowledgement', orderId, async () => {
    const data = await loadOrder(c, orderId);
    if (!data) return skip('not_found');
    const { order, buyer, game, studio, gameAccount } = data;
    if (order.status !== 'refunded') return skip('not_refunded');
    const content = withdrawalAcknowledgementEmail(
      {
        playerName: buyer.name || undefined,
        orderId: order.id,
        item: itemOf(order),
        gameName: game.name,
        gameAccount,
        sellerName: studio.name,
        refundedCents: order.amountCents,
        currency: order.currency,
        paidAt: order.paidAt ?? order.createdAt,
        requestedAt: opts.requestedAt ?? order.refundedAt ?? c.now,
        refundDays: opts.refundDays,
        simulated: opts.simulated ?? (!order.stripePaymentIntentId && !order.stripeCheckoutSessionId),
        purchasesUrl: link(c, '/account/purchases'),
      },
      c.context,
    );
    return { messages: [{ to: buyer.email, content }] };
  });
}

export interface DeliveryFailedResult {
  /** `false` seulement si l'un des envois a échoué (jamais levé). */
  ok: boolean;
  player: NotificationResult;
  studio: NotificationResult;
}

/**
 * Livraison abandonnée (relances épuisées) : e-mail au joueur + alerte au studio.
 * L'alerte studio est **regroupée** : au plus une par jeu et par fenêtre de `STUDIO_ALERT_WINDOW_MS`,
 * listant toutes les livraisons du jeu encore en échec.
 */
export async function sendDeliveryFailed(deliveryId: string, deps: NotifyDeps = {}): Promise<DeliveryFailedResult> {
  const c = resolveDeps(deps);
  let loaded: Awaited<ReturnType<typeof loadDelivery>> | undefined;
  const load = async () => (loaded ??= await loadDelivery(c, deliveryId));

  const player = await notifyOnce(c, 'delivery_failed', deliveryId, async () => {
    const data = await load();
    if (!data) return skip('not_found');
    const { delivery, order, buyer, game, gameAccount } = data;
    if (delivery.status !== 'failed') return skip('not_failed');
    const content = deliveryFailedEmail(
      {
        playerName: buyer.name || undefined,
        orderId: order.id,
        item: itemOf(order),
        gameName: game.name,
        gameAccount,
        amountCents: order.amountCents,
        currency: order.currency,
        paidAt: order.paidAt ?? order.createdAt,
        purchasesUrl: link(c, '/account/purchases'),
      },
      c.context,
    );
    return { messages: [{ to: buyer.email, content }] };
  });

  let studio: NotificationResult;
  try {
    const data = await load();
    if (!data) studio = { ok: true, status: 'skipped', reason: 'not_found' };
    else studio = await sendStudioDeliveryAlert(c, data.game.id);
  } catch (err) {
    studio = { ok: false, error: errorMessage(err) };
  }
  return { ok: player.ok && studio.ok, player, studio };
}

/** Alerte studio regroupée pour un jeu (clé : jeu + début de fenêtre). */
function sendStudioDeliveryAlert(c: Ctx, gameId: string): Promise<NotificationResult> {
  const windowStart = new Date(Math.floor(c.now.getTime() / STUDIO_ALERT_WINDOW_MS) * STUDIO_ALERT_WINDOW_MS);
  return notifyOnce(c, 'studio_delivery_alert', `${gameId}:${windowStart.toISOString()}`, async () => {
    const [game] = await c.database
      .select({ id: games.id, name: games.name, webhookUrl: games.webhookUrl, studioId: games.studioId, studioName: studios.name })
      .from(games)
      .innerJoin(studios, eq(studios.id, games.studioId))
      .where(eq(games.id, gameId));
    if (!game) return skip('not_found');
    const failedWhere = and(
      eq(deliveries.gameId, gameId),
      eq(deliveries.status, 'failed'),
      gte(deliveries.createdAt, new Date(c.now.getTime() - STUDIO_ALERT_LOOKBACK_MS)),
    );
    const rows = await c.database
      .select({
        id: deliveries.id,
        orderId: deliveries.orderId,
        playerId: deliveries.playerId,
        attempts: deliveries.attempts,
        lastError: deliveries.lastError,
        createdAt: deliveries.createdAt,
        lastAttemptAt: sql<string | null>`(select max(${webhookAttempts.createdAt}) from ${webhookAttempts} where ${webhookAttempts.deliveryId} = ${deliveries.id})`,
        itemTitle: orders.itemTitle,
      })
      .from(deliveries)
      .innerJoin(orders, eq(orders.id, deliveries.orderId))
      .where(failedWhere)
      .orderBy(desc(deliveries.createdAt))
      .limit(ALERT_MAX_LISTED);
    if (!rows.length) return skip('not_failed');
    const [{ total }] = await c.database.select({ total: sql<number>`count(*)::int` }).from(deliveries).where(failedWhere);
    const members = await studioRecipients(c, game.studioId, ALERT_ROLES);
    const content = studioDeliveryAlertEmail(
      {
        studioName: game.studioName,
        gameName: game.name,
        failures: rows.map((r) => ({
          deliveryId: r.id,
          orderId: r.orderId,
          itemName: r.itemTitle,
          playerId: r.playerId,
          attempts: r.attempts,
          lastAttemptAt: r.lastAttemptAt ?? r.createdAt,
          lastError: r.lastError ?? undefined,
        })),
        totalFailed: Number(total),
        integrationUrl: link(c, `/studio/games/${game.id}/integration`),
        webhookUrl: game.webhookUrl ?? undefined,
      },
      c.context,
    );
    return { messages: members.map((m) => ({ to: m.email, content })) };
  });
}

/** Bienvenue joueur (inscription). */
export function sendPlayerWelcome(userId: string, deps: NotifyDeps = {}): Promise<NotificationResult> {
  const c = resolveDeps(deps);
  return notifyOnce(c, 'player_welcome', userId, async () => {
    const [u] = await c.database.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, userId));
    if (!u) return skip('not_found');
    const content = playerWelcomeEmail({ name: u.name || undefined, catalogUrl: link(c, '/') }, c.context);
    return { messages: [{ to: u.email, content }] };
  });
}

/* ------------------------------------------------------------------------------------------------
 * Studio
 * ---------------------------------------------------------------------------------------------- */

/** Bienvenue studio (création du studio) — envoyé au(x) propriétaire(s). */
export function sendStudioWelcome(studioId: string, deps: NotifyDeps = {}): Promise<NotificationResult> {
  const c = resolveDeps(deps);
  return notifyOnce(c, 'studio_welcome', studioId, async () => {
    const [s] = await c.database.select({ name: studios.name }).from(studios).where(eq(studios.id, studioId));
    if (!s) return skip('not_found');
    const owners = await studioRecipients(c, studioId, WELCOME_ROLES);
    const fee = env.PLATFORM_FEE_BPS;
    return {
      messages: owners.map((o) => ({
        to: o.email,
        content: studioWelcomeEmail(
          {
            userName: o.name || undefined,
            studioName: s.name,
            dashboardUrl: link(c, '/studio'),
            payoutsUrl: link(c, '/studio/payouts'),
            ...(Number.isFinite(fee) && fee > 0 ? { platformFeeBps: fee } : {}),
          },
          c.context,
        ),
      })),
    };
  });
}

/** Lundi 00:00 UTC de la semaine contenant `d`. */
export function startOfWeekUtc(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // lundi = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

/** Lundi 00:00 UTC de la dernière semaine complète avant `now` (semaine rapportée par le cron du lundi). */
export function previousWeekStart(now: Date = new Date()): Date {
  return new Date(startOfWeekUtc(now).getTime() - WEEK_MS);
}

export interface WeeklySales {
  currency: Currency;
  games: WeeklyGameStats[];
  topItem?: { name: string; gameName: string; orders: number };
  orders: number;
  previousOrders: number;
}

/**
 * Agrège les ventes payées d'un studio sur [weekStart, weekStart + 7 j) et la semaine précédente.
 * Le rapport est mono-devise : on retient la devise qui pèse le plus sur la semaine (EUR à défaut).
 */
export async function computeWeeklySales(studioId: string, weekStart: Date, database: DB = db): Promise<WeeklySales> {
  const prevStart = new Date(weekStart.getTime() - WEEK_MS);
  const end = new Date(weekStart.getTime() + WEEK_MS);
  const aggregate = (from: Date, to: Date) =>
    database
      .select({
        gameId: games.id,
        gameName: games.name,
        currency: orders.currency,
        revenue: sql<number>`coalesce(sum(${orders.amountCents}), 0)::int`,
        fee: sql<number>`coalesce(sum(${orders.platformFeeCents}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .innerJoin(games, eq(games.id, orders.gameId))
      .where(and(eq(games.studioId, studioId), eq(orders.status, 'paid'), gte(orders.paidAt, from), lt(orders.paidAt, to)))
      .groupBy(games.id, games.name, orders.currency);
  const [currentRows, previousRows] = await Promise.all([aggregate(weekStart, end), aggregate(prevStart, weekStart)]);
  const rows = [...currentRows.map((r) => ({ ...r, current: true })), ...previousRows.map((r) => ({ ...r, current: false }))];

  const byCurrency = new Map<Currency, number>();
  for (const r of currentRows) byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + Number(r.revenue));
  const currency: Currency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? previousRows[0]?.currency ?? 'EUR';

  const stats = new Map<string, WeeklyGameStats & { fee: number }>();
  let ordersCount = 0;
  let previousOrders = 0;
  for (const r of rows) {
    if (r.currency !== currency) continue;
    const g = stats.get(r.gameId) ?? { name: r.gameName, revenueCents: 0, orders: 0, previousRevenueCents: 0, fee: 0 };
    if (r.current) {
      g.revenueCents += Number(r.revenue);
      g.orders += Number(r.count);
      g.fee += Number(r.fee);
      ordersCount += Number(r.count);
    } else {
      g.previousRevenueCents = (g.previousRevenueCents ?? 0) + Number(r.revenue);
      previousOrders += Number(r.count);
    }
    stats.set(r.gameId, g);
  }
  const gameStats: WeeklyGameStats[] = [...stats.values()]
    .filter((g) => g.orders > 0 || (g.previousRevenueCents ?? 0) > 0)
    .map(({ fee, ...g }) => ({ ...g, ...(g.revenueCents > 0 ? { platformFeeBps: Math.round((fee / g.revenueCents) * 10_000) } : {}) }));

  const [top] = await database
    .select({ name: orders.itemTitle, gameName: games.name, orders: sql<number>`count(*)::int` })
    .from(orders)
    .innerJoin(games, eq(games.id, orders.gameId))
    .where(
      and(eq(games.studioId, studioId), eq(orders.status, 'paid'), eq(orders.currency, currency), gte(orders.paidAt, weekStart), lt(orders.paidAt, end)),
    )
    .groupBy(orders.itemTitle, games.name)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  return {
    currency,
    games: gameStats,
    topItem: top ? { name: top.name, gameName: top.gameName, orders: Number(top.orders) } : undefined,
    orders: ordersCount,
    previousOrders,
  };
}

/**
 * Rapport hebdomadaire d'un studio pour la semaine commençant `weekStart` (ramené au lundi 00:00 UTC).
 * Clé d'idempotence : `studioId:AAAA-MM-JJ`. Pas d'e-mail si aucune vente cette semaine ni la précédente.
 */
export function sendWeeklyStudioReport(studioId: string, weekStart: Date, deps: NotifyDeps = {}): Promise<NotificationResult> {
  const c = resolveDeps(deps);
  const start = startOfWeekUtc(weekStart);
  const refId = `${studioId}:${start.toISOString().slice(0, 10)}`;
  return notifyOnce(c, 'studio_weekly_report', refId, async () => {
    if (start.getTime() + WEEK_MS > c.now.getTime()) return skip('no_activity'); // semaine pas encore terminée
    const [s] = await c.database.select({ name: studios.name }).from(studios).where(eq(studios.id, studioId));
    if (!s) return skip('not_found');
    const sales = await computeWeeklySales(studioId, start, c.database);
    if (sales.orders === 0 && sales.previousOrders === 0) return skip('no_activity');
    const members = await studioRecipients(c, studioId, REPORT_ROLES);
    const content = studioWeeklyReportEmail(
      {
        studioName: s.name,
        periodStart: start,
        // Dernier jour inclus (dimanche).
        periodEnd: new Date(start.getTime() + WEEK_MS - 1),
        currency: sales.currency,
        games: sales.games,
        topItem: sales.topItem,
        salesUrl: link(c, '/studio'),
      },
      c.context,
    );
    return { messages: members.map((m) => ({ to: m.email, content })) };
  });
}

export interface WeeklyReportsRun {
  weekStart: string;
  studios: number;
  sent: number;
  skipped: number;
  failed: number;
}

/** Envoie le rapport hebdomadaire de tous les studios (cron du lundi). Ne lève jamais pour un studio isolé. */
export async function sendAllWeeklyReports(weekStart: Date = previousWeekStart(), deps: NotifyDeps = {}): Promise<WeeklyReportsRun> {
  const database = deps.database ?? db;
  const start = startOfWeekUtc(weekStart);
  // Studios ayant au moins un jeu (ceux sans vente sur deux semaines sont ignorés par sendWeeklyStudioReport).
  const list = await database.selectDistinct({ id: studios.id }).from(studios).innerJoin(games, eq(games.studioId, studios.id));
  const run: WeeklyReportsRun = { weekStart: start.toISOString().slice(0, 10), studios: list.length, sent: 0, skipped: 0, failed: 0 };
  for (const { id } of list) {
    const r = await sendWeeklyStudioReport(id, start, deps);
    if (!r.ok) run.failed++;
    else if (r.status === 'sent') run.sent++;
    else run.skipped++;
  }
  return run;
}
