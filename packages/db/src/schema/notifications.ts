import { index, integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

/*
 * Ajout tâche « notifications » — journal des e-mails transactionnels envoyés.
 * Clé d'idempotence : (kind, ref_id). Une ligne `sent` ou `sending` récente empêche tout second envoi ;
 * une ligne `failed` (ou un `sending` abandonné) peut être reprise.
 */
export type NotificationKind =
  | 'purchase_receipt'
  | 'purchase_delivered'
  | 'delivery_failed'
  | 'studio_delivery_alert'
  | 'player_welcome'
  | 'studio_welcome'
  | 'studio_weekly_report'
  | 'withdrawal_acknowledgement';

export type NotificationStatus = 'sending' | 'sent' | 'failed' | 'skipped';

export const notificationsSent = pgTable(
  'notifications_sent',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<NotificationKind>().notNull(),
    /** Objet concerné : id de commande, de livraison, d'utilisateur, `studioId:semaine`… */
    refId: text('ref_id').notNull(),
    /** Destinataire(s), séparés par des virgules. */
    recipient: text('recipient'),
    status: text('status').$type<NotificationStatus>().notNull().default('sending'),
    /** Identifiant renvoyé par le transport (id Resend, fichier console). */
    providerId: text('provider_id'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('notifications_sent_kind_ref_uq').on(t.kind, t.refId), index('notifications_sent_created_idx').on(t.createdAt)],
);
