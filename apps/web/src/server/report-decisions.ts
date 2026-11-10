import 'server-only';
import { and, contentReports, db, eq, games, inArray, items, type DB } from '@devappstore/db';
import { contextFromEnv, createMailerFromEnv, reportDecisionEmail, sendEmail, type Mailer } from '@devappstore/emails';
import { SUSPENSION_GROUNDS, type SuspensionGround } from './admin-logic';
import { reportCategoryLabel } from './reports-logic';

/*
 * Clôture des signalements par une décision du back-office, et information des signalants.
 * Module sans dépendance vers admin.ts : il est appelé par `moderateGame` (suspension, dans SA transaction) et par
 * `dismissReports` (reports.ts).
 */

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
type Exec = DB | Tx;

export interface CloseReportsInput {
  gameId: string;
  adminId: string;
  decision: 'dismissed' | 'actioned';
  reason: string;
  ground?: string | null;
  noticeId?: string | null;
  /** Limite la clôture à ces signalements (ceux que l'administrateur avait sous les yeux). */
  onlyIds?: readonly string[];
  now: Date;
}

/**
 * Clôt les signalements OUVERTS du jeu (tous, ou `onlyIds`) — à appeler dans la transaction de la décision, avec
 * l'écriture du journal d'audit. Mise à jour conditionnelle (`status = 'open'`) : un signalement déjà clos par une
 * décision concurrente n'est pas réécrit. Renvoie les ids clos.
 */
export async function closeOpenReports(exec: Exec, input: CloseReportsInput): Promise<string[]> {
  if (input.onlyIds && !input.onlyIds.length) return [];
  const rows = await exec
    .update(contentReports)
    .set({
      status: input.decision,
      decidedAt: input.now,
      decidedBy: input.adminId,
      decisionReason: input.reason,
      decisionGround: input.ground ?? null,
      decisionNoticeId: input.noticeId ?? null,
    })
    .where(
      and(
        eq(contentReports.gameId, input.gameId),
        eq(contentReports.status, 'open'),
        input.onlyIds ? inArray(contentReports.id, [...input.onlyIds]) : undefined,
      ),
    )
    .returning({ id: contentReports.id });
  return rows.map((r) => r.id);
}

export interface ReportNotifyDeps {
  mailer?: Mailer;
}

let envMailer: Mailer | null = null;

/**
 * Envoie à chaque signalant la décision et son motif, et note l'envoi (ou l'erreur) sur le signalement.
 * Ne lève jamais : la décision est déjà enregistrée. Renvoie le nombre d'e-mails envoyés.
 */
export async function notifyReportersOfDecision(reportIds: readonly string[], deps: ReportNotifyDeps = {}): Promise<number> {
  if (!reportIds.length) return 0;
  let sent = 0;
  try {
    const rows = await db
      .select({
        id: contentReports.id,
        email: contentReports.reporterEmail,
        category: contentReports.category,
        status: contentReports.status,
        reason: contentReports.decisionReason,
        ground: contentReports.decisionGround,
        decidedAt: contentReports.decidedAt,
        createdAt: contentReports.createdAt,
        gameName: games.name,
        itemTitle: items.title,
      })
      .from(contentReports)
      .innerJoin(games, eq(games.id, contentReports.gameId))
      .leftJoin(items, eq(items.id, contentReports.itemId))
      .where(inArray(contentReports.id, [...reportIds]));
    const ctx = contextFromEnv();
    const mailer = deps.mailer ?? (envMailer ??= createMailerFromEnv());
    for (const r of rows) {
      if (r.status === 'open' || !r.reason || !r.decidedAt) continue;
      try {
        const groundLabel = r.ground && Object.hasOwn(SUSPENSION_GROUNDS, r.ground) ? SUSPENSION_GROUNDS[r.ground as SuspensionGround] : r.ground;
        const content = reportDecisionEmail(
          {
            reportId: r.id,
            gameName: r.gameName,
            itemTitle: r.itemTitle,
            categoryLabel: reportCategoryLabel(r.category),
            reportedAt: r.createdAt,
            decision: r.status,
            reason: r.reason,
            groundLabel,
            decidedAt: r.decidedAt,
          },
          ctx,
        );
        await sendEmail(mailer, r.email, content);
        await db.update(contentReports).set({ decisionSentAt: new Date(), notifyError: null }).where(eq(contentReports.id, r.id));
        sent++;
      } catch (e) {
        const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        console.error(`[signalements] décision non envoyée pour ${r.id} : ${message}`);
        await db.update(contentReports).set({ notifyError: message }).where(eq(contentReports.id, r.id)).catch(() => {});
      }
    }
  } catch (e) {
    console.error(`[signalements] notification des signalants impossible : ${e instanceof Error ? e.message : String(e)}`);
  }
  return sent;
}
