import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { games, items } from './studio';

/*
 * Signalements de contenus hors charte (mécanisme de notification inspiré de l'article 16 du règlement (UE) 2022/2065,
 * « DSA »). Un studio publie sans revue préalable : la modération se fait a posteriori, à partir de ces signalements.
 *
 * - Ouvert aux visiteurs non connectés : `reporter_email` est obligatoire, `reporter_user_id` facultatif.
 * - Anti-doublon : un même signalant (e-mail) n'a qu'un signalement OUVERT par cible (jeu, ou article du jeu) —
 *   index unique partiel sur les signalements `open` ; une fois la décision rendue, il peut signaler à nouveau.
 * - Décision (back-office) : `dismissed` (classé sans suite, motif obligatoire) ou `actioned` (jeu suspendu, motif =
 *   celui de la suspension, `decision_notice_id` = notification de modération envoyée au studio). La décision clôt tous
 *   les signalements ouverts du jeu et est journalisée dans `admin_audit_log` dans la même transaction.
 * - Aucune adresse IP n'est conservée : la limitation de débit passe par les compteurs du limiteur.
 */

export type ContentReportStatus = 'open' | 'dismissed' | 'actioned';

export const contentReports = pgTable(
  'content_reports',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    /** Article visé (facultatif) ; null = le jeu dans son ensemble. */
    itemId: text('item_id').references(() => items.id, { onDelete: 'set null' }),
    /** Cible de l'anti-doublon : id de l'article, ou « game ». Conservée même si l'article est supprimé. */
    target: text('target').notNull(),
    /** Catégorie (`REPORT_CATEGORIES` dans apps/web/src/server/reports-logic.ts). */
    category: text('category').notNull(),
    /** Explication du signalant (20 à 2000 caractères). */
    explanation: text('explanation').notNull(),
    /** E-mail du signalant, normalisé (minuscules) : accusé de réception et décision. */
    reporterEmail: text('reporter_email').notNull(),
    reporterUserId: text('reporter_user_id').references(() => user.id, { onDelete: 'set null' }),
    /** Horodatage de la déclaration de bonne foi (case cochée). */
    goodFaithAt: timestamp('good_faith_at').notNull(),
    status: text('status').$type<ContentReportStatus>().notNull().default('open'),
    decidedAt: timestamp('decided_at'),
    /** Administrateur ayant rendu la décision (sans clé étrangère, comme le journal d'audit). */
    decidedBy: text('decided_by'),
    /** Motif communiqué au signalant. */
    decisionReason: text('decision_reason'),
    /** Suspension : fondement (`SUSPENSION_GROUNDS`) et notification de modération du studio. */
    decisionGround: text('decision_ground'),
    decisionNoticeId: text('decision_notice_id'),
    /** Accusé de réception envoyé au signalant. */
    ackSentAt: timestamp('ack_sent_at'),
    /** E-mail de décision envoyé au signalant. */
    decisionSentAt: timestamp('decision_sent_at'),
    notifyError: text('notify_error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('content_reports_open_dedupe_idx')
      .on(t.gameId, t.target, t.reporterEmail)
      .where(sql`status = 'open'`),
    index('content_reports_status_game_idx').on(t.status, t.gameId, t.createdAt),
    index('content_reports_game_idx').on(t.gameId, t.createdAt),
  ],
);
