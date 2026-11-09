import { z } from 'zod';
import type { GameStatus } from '@devappstore/core';
import type { ModerationAction, PlatformAdminRole } from '@devappstore/db';

/*
 * Règles pures du back-office Dev AppStore (sans base ni session) : rôles, transitions de modération,
 * validation des motifs, périodes du tableau de bord, recherche.
 */

export const PLATFORM_ADMIN_ROLES: readonly PlatformAdminRole[] = ['superadmin', 'support', 'finance'];

export const ADMIN_ROLE_LABELS: Record<PlatformAdminRole, string> = {
  superadmin: 'Superadmin',
  support: 'Support',
  finance: 'Finance',
};

export type AdminPermission =
  | 'dashboard.read'
  | 'games.read'
  | 'games.moderate'
  | 'studios.read'
  | 'orders.read'
  | 'orders.retry_delivery'
  | 'users.read'
  | 'users.disable'
  | 'audit.read';

/** Matrice des droits : le support agit sur les jeux, commandes et comptes ; la finance lit et contrôle. */
const PERMISSIONS: Record<AdminPermission, readonly PlatformAdminRole[]> = {
  'dashboard.read': ['superadmin', 'support', 'finance'],
  'games.read': ['superadmin', 'support', 'finance'],
  'games.moderate': ['superadmin', 'support'],
  'studios.read': ['superadmin', 'support', 'finance'],
  'orders.read': ['superadmin', 'support', 'finance'],
  'orders.retry_delivery': ['superadmin', 'support'],
  'users.read': ['superadmin', 'support'],
  'users.disable': ['superadmin', 'support'],
  'audit.read': ['superadmin', 'finance'],
};

export function rolesFor(permission: AdminPermission): PlatformAdminRole[] {
  return [...PERMISSIONS[permission]];
}

export function can(role: PlatformAdminRole | null | undefined, permission: AdminPermission): boolean {
  return !!role && PERMISSIONS[permission].includes(role);
}

export function isPlatformAdminRole(value: unknown): value is PlatformAdminRole {
  return typeof value === 'string' && (PLATFORM_ADMIN_ROLES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------------------------------------
 * Modération des jeux
 * ---------------------------------------------------------------------------------------------- */

/** Statut atteint par une action de modération, ou `null` si elle n'est pas permise depuis `from`. */
export function nextGameStatus(from: GameStatus, action: ModerationAction): GameStatus | null {
  switch (action) {
    case 'approve':
      return from === 'review' ? 'live' : null;
    case 'suspend':
      return from === 'suspended' ? null : 'suspended';
    case 'reactivate':
      return from === 'suspended' ? 'live' : null;
  }
}

export const MODERATION_ACTION_LABELS: Record<ModerationAction, string> = {
  approve: 'Revue approuvée',
  suspend: 'Suspension',
  reactivate: 'Réactivation',
};

/** Fondements de suspension (catégories des conditions studio), communiqués au studio avec le motif détaillé. */
export const SUSPENSION_GROUNDS = {
  illegal_content: 'Contenu illicite ou trompeur',
  fraud: 'Fraude ou paiements suspects',
  delivery_failures: 'Livraisons des achats défaillantes',
  terms_violation: 'Non-respect des conditions studio',
  legal_request: 'Injonction d’une autorité',
  other: 'Autre motif',
} as const;
export type SuspensionGround = keyof typeof SUSPENSION_GROUNDS;

export const REASON_MIN = 20;
export const REASON_MAX = 2000;

const reasonField = z
  .string({ error: 'Le motif est obligatoire.' })
  .trim()
  .min(1, 'Le motif est obligatoire.')
  .min(REASON_MIN, `Le motif doit faire au moins ${REASON_MIN} caractères : il est communiqué tel quel.`)
  .max(REASON_MAX, `Le motif ne doit pas dépasser ${REASON_MAX} caractères.`);

export const suspendGameSchema = z.object({
  ground: z.enum(Object.keys(SUSPENSION_GROUNDS) as [SuspensionGround, ...SuspensionGround[]], {
    error: 'Choisissez le fondement de la suspension.',
  }),
  reason: reasonField,
});
export type SuspendGameInput = z.input<typeof suspendGameSchema>;

export const disableUserSchema = z.object({ reason: reasonField });

/** Note facultative (approbation, réactivation, réactivation de compte). */
export const optionalNoteSchema = z
  .string()
  .trim()
  .max(REASON_MAX, `La note ne doit pas dépasser ${REASON_MAX} caractères.`)
  .optional()
  .transform((v) => (v ? v : undefined));

/** Premier message d'erreur zod, lisible. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Données invalides.';
}

/* ------------------------------------------------------------------------------------------------
 * Tableau de bord
 * ---------------------------------------------------------------------------------------------- */

export type DashboardPeriod = 7 | 30;

export function parsePeriod(value: unknown): DashboardPeriod {
  return value === '7' || value === 7 ? 7 : 30;
}

const DAY_MS = 86_400_000;

/**
 * Début de la période : minuit UTC du jour situé `days - 1` jours avant `now` (la période couvre `days` jours
 * calendaires, aujourd'hui compris — exactement les jours de `dayKeys`, donc la série journalière somme au total).
 */
export function periodStart(days: number, now: Date = new Date()): Date {
  const d = new Date(now.getTime() - (days - 1) * DAY_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Clés de jour (UTC, AAAA-MM-JJ) de la fenêtre, de la plus ancienne à aujourd'hui. */
export function dayKeys(days: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(new Date(now.getTime() - i * DAY_MS).toISOString().slice(0, 10));
  return keys;
}

/** Complète une série journalière (jours sans vente = 0). */
export function fillDailySeries(days: number, rows: { day: string; cents: number }[], now: Date = new Date()) {
  const map = new Map(rows.map((r) => [r.day, r.cents]));
  return dayKeys(days, now).map((day) => ({ day, cents: map.get(day) ?? 0 }));
}

/** Taux de commission effectif en points de base (0 si pas de volume). */
export function effectiveTakeRateBps(gmvCents: number, feeCents: number): number {
  return gmvCents > 0 ? Math.round((feeCents / gmvCents) * 10_000) : 0;
}

/* ------------------------------------------------------------------------------------------------
 * Recherche
 * ---------------------------------------------------------------------------------------------- */

/** Nettoie une saisie de recherche (espaces, longueur). */
export function normalizeQuery(q: unknown, max = 200): string {
  return typeof q === 'string' ? q.trim().slice(0, max) : '';
}

/** Échappe `%`, `_` et `\` pour un motif LIKE/ILIKE. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const PAGE_SIZE = 50;

export function parsePage(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : typeof value === 'number' ? value : 1;
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 10_000) : 1;
}

/* ------------------------------------------------------------------------------------------------
 * Journal d'audit
 * ---------------------------------------------------------------------------------------------- */

export type AdminAuditAction =
  | 'game.approve'
  | 'game.suspend'
  | 'game.reactivate'
  | 'order.retry_delivery'
  | 'user.disable'
  | 'user.enable';

export const AUDIT_ACTION_LABELS: Record<AdminAuditAction, string> = {
  'game.approve': 'Jeu approuvé',
  'game.suspend': 'Jeu suspendu',
  'game.reactivate': 'Jeu réactivé',
  'order.retry_delivery': 'Livraison relancée',
  'user.disable': 'Compte désactivé',
  'user.enable': 'Compte réactivé',
};

export function auditActionLabel(action: string): string {
  return (AUDIT_ACTION_LABELS as Record<string, string>)[action] ?? action;
}

/** Lien vers la cible d'une entrée du journal. */
export function auditTargetHref(targetType: string, targetId: string): string | null {
  const id = encodeURIComponent(targetId);
  switch (targetType) {
    case 'game':
      return `/admin/games/${id}`;
    case 'order':
      return `/admin/orders/${id}`;
    case 'user':
      return `/admin/users/${id}`;
    case 'studio':
      return `/admin/studios/${id}`;
    default:
      return null;
  }
}
