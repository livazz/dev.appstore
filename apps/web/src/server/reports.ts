import 'server-only';
import { newId } from '@devappstore/core';
import { and, contentReports, count, db, desc, eq, games, items, studios } from '@devappstore/db';
import { contextFromEnv, createMailerFromEnv, reportReceivedEmail, sendEmail, type Mailer } from '@devappstore/emails';
import { AdminError, logAdminAction, requireAdminPermission } from './admin';
import { firstIssue } from './admin-logic';
import { UNKNOWN_IP } from './client-ip';
import { getRateLimitStore, type RateLimitStore } from './rate-limit';
import { closeOpenReports, notifyReportersOfDecision } from './report-decisions';
import {
  CONTENT_POLICY_HREF,
  GOOD_FAITH_LABEL,
  REPORT_LIMITS,
  dismissReportsSchema,
  reportCategoryLabel,
  reportInputSchema,
  reportTarget,
  suggestedGround,
  type ReportInput,
} from './reports-logic';

/*
 * Signalements de contenus hors charte (DSA art. 16, voir reports-logic.ts).
 *
 * Côté joueur (`submitReport`) : ouvert aux visiteurs ; validation, limitation de débit par IP / e-mail / compte,
 * anti-doublon (index unique partiel), accusé de réception par e-mail. Seuls les jeux EN LIGNE peuvent être signalés
 * (les autres ne sont pas publics) ; l'article visé doit appartenir au jeu.
 *
 * Côté back-office : liste des signalements ouverts regroupés par jeu, « classer sans suite » (`dismissReports`).
 * La suspension passe par le panneau de modération existant (`suspendGame` d'admin.ts), qui clôt les signalements dans
 * sa transaction. Le studio n'est pas prévenu d'un simple signalement.
 */

export type SubmitReportResult =
  | { ok: true; reportId: string; receivedAt: Date; email: string; gameName: string; itemTitle: string | null; ackSent: boolean }
  | { ok: false; error: 'invalid' | 'not_found' | 'rate_limited' | 'duplicate'; message: string; retryAfterS?: number };

export interface SubmitReportContext {
  /** Compte connecté (facultatif). */
  user?: { id: string; email: string } | null;
  /** IP du client (`clientIp`). */
  ip: string;
  now?: Date;
  mailer?: Mailer;
  store?: RateLimitStore;
}

let envMailer: Mailer | null = null;

function minutes(s: number) {
  return Math.max(1, Math.ceil(s / 60));
}

/** Code Postgres de violation d'unicité (postgres-js et PGlite, éventuellement enveloppé par Drizzle). */
function isUniqueViolation(e: unknown): boolean {
  for (let cur: unknown = e, i = 0; cur && i < 4; cur = (cur as { cause?: unknown }).cause, i++) {
    if ((cur as { code?: string }).code === '23505') return true;
  }
  return false;
}

export async function submitReport(gameSlug: string, input: ReportInput, ctx: SubmitReportContext): Promise<SubmitReportResult> {
  const now = ctx.now ?? new Date();
  const parsed = reportInputSchema.safeParse({ ...input, email: input.email || ctx.user?.email || '' });
  if (!parsed.success) return { ok: false, error: 'invalid', message: firstIssue(parsed.error) };
  const data = parsed.data;

  const [game] = await db
    .select({ id: games.id, name: games.name })
    .from(games)
    .where(and(eq(games.slug, gameSlug), eq(games.status, 'live')));
  if (!game) return { ok: false, error: 'not_found', message: 'Ce jeu n’existe pas ou n’est plus en ligne.' };
  let itemTitle: string | null = null;
  if (data.itemId) {
    const [item] = await db
      .select({ title: items.title })
      .from(items)
      .where(and(eq(items.id, data.itemId), eq(items.gameId, game.id), eq(items.active, true)));
    if (!item) return { ok: false, error: 'invalid', message: 'L’article choisi n’appartient pas à ce jeu.' };
    itemTitle = item.title;
  }

  // Limitation de débit : après validation (une saisie invalide ne consomme rien), avant toute écriture.
  const store = ctx.store ?? getRateLimitStore();
  const t = now.getTime();
  const checks: [string, (typeof REPORT_LIMITS)[keyof typeof REPORT_LIMITS]][] = [
    // IP inconnue (proxy mal configuré) : compteur commun, volontairement prudent.
    [`report:ip:${ctx.ip || UNKNOWN_IP}`, REPORT_LIMITS.perIpBurst],
    [`report:ip-day:${ctx.ip || UNKNOWN_IP}`, REPORT_LIMITS.perIpDay],
    [`report:email:${data.email}`, REPORT_LIMITS.perEmailDay],
    ...(ctx.user ? ([[`report:user:${ctx.user.id}`, REPORT_LIMITS.perAccountDay]] as typeof checks) : []),
  ];
  for (const [key, rule] of checks) {
    const d = await store.hit(key, rule, t);
    if (!d.allowed) {
      return {
        ok: false,
        error: 'rate_limited',
        message: `Trop de signalements envoyés depuis cette connexion ou cette adresse. Réessayez dans ${minutes(d.retryAfterS)} min.`,
        retryAfterS: d.retryAfterS,
      };
    }
  }

  const reportId = newId('rpt');
  const target = reportTarget(data.itemId);
  try {
    const inserted = await db
      .insert(contentReports)
      .values({
        id: reportId,
        gameId: game.id,
        itemId: data.itemId,
        target,
        category: data.category,
        explanation: data.explanation,
        reporterEmail: data.email,
        reporterUserId: ctx.user?.id ?? null,
        goodFaithAt: now,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: contentReports.id });
    if (!inserted.length) return duplicate();
  } catch (e) {
    if (isUniqueViolation(e)) return duplicate();
    throw e;
  }

  const ackSent = await sendAcknowledgement(
    { reportId, email: data.email, gameName: game.name, itemTitle, category: data.category, explanation: data.explanation, receivedAt: now },
    ctx.mailer,
  );
  return { ok: true, reportId, receivedAt: now, email: data.email, gameName: game.name, itemTitle, ackSent };
}

function duplicate(): SubmitReportResult {
  return {
    ok: false,
    error: 'duplicate',
    message: 'Vous avez déjà signalé ce contenu : votre signalement est en cours d’examen. Vous recevrez la décision par e-mail.',
  };
}

/** Accusé de réception (DSA art. 16, § 4). Ne lève jamais : le signalement est enregistré. */
async function sendAcknowledgement(
  r: { reportId: string; email: string; gameName: string; itemTitle: string | null; category: string; explanation: string; receivedAt: Date },
  mailer?: Mailer,
): Promise<boolean> {
  try {
    const content = reportReceivedEmail(
      {
        reportId: r.reportId,
        gameName: r.gameName,
        itemTitle: r.itemTitle,
        categoryLabel: reportCategoryLabel(r.category),
        explanation: r.explanation,
        receivedAt: r.receivedAt,
        goodFaithLabel: GOOD_FAITH_LABEL,
        policyPath: CONTENT_POLICY_HREF,
      },
      contextFromEnv(),
    );
    await sendEmail(mailer ?? (envMailer ??= createMailerFromEnv()), r.email, content);
    await db.update(contentReports).set({ ackSentAt: new Date() }).where(eq(contentReports.id, r.reportId));
    return true;
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    console.error(`[signalements] accusé de réception non envoyé pour ${r.reportId} : ${message}`);
    await db.update(contentReports).set({ notifyError: message }).where(eq(contentReports.id, r.reportId)).catch(() => {});
    return false;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Back-office
 * ---------------------------------------------------------------------------------------------- */

/** Nombre de signalements ouverts (tableau de bord). L'appelant vérifie la permission `reports.moderate`. */
export async function countOpenReports(): Promise<{ reports: number; games: number }> {
  const rows = await db.select({ gameId: contentReports.gameId, n: count() }).from(contentReports).where(eq(contentReports.status, 'open')).groupBy(contentReports.gameId);
  return { reports: rows.reduce((s, r) => s + r.n, 0), games: rows.length };
}

export interface OpenReportGroup {
  game: { id: string; name: string; slug: string; status: string; studioName: string };
  count: number;
  /** Fondement de suspension suggéré (catégorie la plus signalée). */
  suggestedGround: string;
  reports: {
    id: string;
    itemId: string | null;
    itemTitle: string | null;
    category: string;
    explanation: string;
    reporterEmail: string;
    hasAccount: boolean;
    createdAt: Date;
  }[];
}

/** Signalements ouverts regroupés par jeu (les jeux les plus signalés d'abord). Vérifie la permission. */
export async function listOpenReportsForAdmin(): Promise<OpenReportGroup[]> {
  await requireAdminPermission('reports.moderate');
  const rows = await db
    .select({
      id: contentReports.id,
      itemId: contentReports.itemId,
      itemTitle: items.title,
      category: contentReports.category,
      explanation: contentReports.explanation,
      reporterEmail: contentReports.reporterEmail,
      reporterUserId: contentReports.reporterUserId,
      createdAt: contentReports.createdAt,
      gameId: games.id,
      gameName: games.name,
      gameSlug: games.slug,
      gameStatus: games.status,
      studioName: studios.name,
    })
    .from(contentReports)
    .innerJoin(games, eq(games.id, contentReports.gameId))
    .innerJoin(studios, eq(studios.id, games.studioId))
    .leftJoin(items, eq(items.id, contentReports.itemId))
    .where(eq(contentReports.status, 'open'))
    .orderBy(desc(contentReports.createdAt))
    .limit(1000);
  const groups = new Map<string, OpenReportGroup>();
  for (const r of rows) {
    let g = groups.get(r.gameId);
    if (!g) {
      g = { game: { id: r.gameId, name: r.gameName, slug: r.gameSlug, status: r.gameStatus, studioName: r.studioName }, count: 0, suggestedGround: 'other', reports: [] };
      groups.set(r.gameId, g);
    }
    g.count++;
    g.reports.push({
      id: r.id,
      itemId: r.itemId,
      itemTitle: r.itemTitle,
      category: r.category,
      explanation: r.explanation,
      reporterEmail: r.reporterEmail,
      hasAccount: !!r.reporterUserId,
      createdAt: r.createdAt,
    });
  }
  const list = [...groups.values()];
  for (const g of list) g.suggestedGround = suggestedGround(g.reports.map((r) => r.category));
  return list.sort((a, b) => b.count - a.count || b.reports[0]!.createdAt.getTime() - a.reports[0]!.createdAt.getTime());
}

export interface DismissResult {
  closed: number;
  notified: number;
  /** Signalements arrivés après l'affichage de la page : restés ouverts. */
  stillOpen: number;
}

/**
 * « Classer sans suite » : clôt les signalements ouverts du jeu que l'administrateur avait sous les yeux (`reportIds` ;
 * ceux arrivés entre-temps restent ouverts pour être examinés), journalise dans la même transaction, puis informe
 * chaque signalant de la décision et du motif. Le studio n'est pas prévenu.
 */
export async function dismissReports(
  gameId: string,
  input: { reason?: unknown; reportIds?: readonly string[] },
  deps: { mailer?: Mailer; now?: Date } = {},
): Promise<DismissResult> {
  const admin = await requireAdminPermission('reports.moderate');
  const parsed = dismissReportsSchema.safeParse({ reason: input.reason });
  if (!parsed.success) throw new AdminError(firstIssue(parsed.error));
  const reportIds = [...new Set((input.reportIds ?? []).filter((id) => typeof id === 'string' && id))].slice(0, 1000);
  if (!reportIds.length) throw new AdminError('Aucun signalement à classer : rechargez la page.');
  const now = deps.now ?? new Date();
  const closed = await db.transaction(async (tx) => {
    const [g] = await tx.select({ id: games.id, studioId: games.studioId }).from(games).where(eq(games.id, gameId));
    if (!g) throw new AdminError('Jeu introuvable.');
    const ids = await closeOpenReports(tx, { gameId, adminId: admin.user.id, decision: 'dismissed', reason: parsed.data.reason, onlyIds: reportIds, now });
    if (!ids.length) throw new AdminError('Ces signalements ont déjà été traités : rechargez la page.');
    await logAdminAction(tx, {
      adminId: admin.user.id,
      action: 'reports.dismiss',
      targetType: 'game',
      targetId: gameId,
      details: { reportIds: ids, reason: parsed.data.reason, studioId: g.studioId },
    });
    return ids;
  });
  const [open] = await db
    .select({ n: count() })
    .from(contentReports)
    .where(and(eq(contentReports.gameId, gameId), eq(contentReports.status, 'open')));
  const notified = await notifyReportersOfDecision(closed, deps);
  return { closed: closed.length, notified, stillOpen: open?.n ?? 0 };
}

