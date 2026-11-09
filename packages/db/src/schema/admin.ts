import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { GameStatus } from '@wolleen/core';
import { user } from './auth';
import { games } from './studio';

/*
 * Back-office de l'équipe Dev AppStore (tâche « admin »).
 * - platform_admins : administrateurs de la plateforme (distincts des membres de studio) ;
 * - admin_audit_log : journal IMMUABLE de toutes les actions d'administration (uniquement des INSERT) ;
 * - game_moderation_notices : décisions de modération communiquées au studio (exigence P2B, règlement UE 2019/1150 art. 4) ;
 * - user_suspensions : comptes désactivés par l'équipe.
 */

export type PlatformAdminRole = 'superadmin' | 'support' | 'finance';

export const platformAdmins = pgTable('platform_admins', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').$type<PlatformAdminRole>().notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Journal d'audit. `admin_id` n'a volontairement pas de clé étrangère : le journal doit survivre à la suppression
 * d'un compte. `details` ne contient jamais de secret (clé API, secret webhook, mot de passe).
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: text('id').primaryKey(),
    adminId: text('admin_id').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('admin_audit_created_idx').on(t.createdAt),
    index('admin_audit_target_idx').on(t.targetType, t.targetId),
    index('admin_audit_admin_idx').on(t.adminId, t.createdAt),
  ],
);

export type ModerationAction = 'approve' | 'suspend' | 'reactivate';

/** Décision de modération d'un jeu, avec le motif communiqué au studio (e-mail + espace studio). */
export const gameModerationNotices = pgTable(
  'game_moderation_notices',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    adminId: text('admin_id').notNull(),
    action: text('action').$type<ModerationAction>().notNull(),
    fromStatus: text('from_status').$type<GameStatus>().notNull(),
    toStatus: text('to_status').$type<GameStatus>().notNull(),
    /** Fondement (catégorie des conditions studio) — suspension uniquement. */
    ground: text('ground'),
    /** Motif détaillé, obligatoire pour une suspension. */
    reason: text('reason'),
    /** Destinataires de l'e-mail, séparés par des virgules. */
    notifiedTo: text('notified_to'),
    notifiedAt: timestamp('notified_at'),
    notifyError: text('notify_error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('game_moderation_game_idx').on(t.gameId, t.createdAt)],
);

/** Compte désactivé : plus de connexion, sessions révoquées. Supprimer la ligne réactive le compte. */
export const userSuspensions = pgTable('user_suspensions', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  adminId: text('admin_id').notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
