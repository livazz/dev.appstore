import { z } from 'zod';
import type { RateRule } from './rate-limit';
import { REASON_MAX, REASON_MIN, SUSPENSION_GROUNDS, type SuspensionGround } from './admin-logic';

/*
 * Règles pures des signalements de contenus hors charte (sans base ni session) — importable côté client.
 * Mécanisme de notification inspiré de l'article 16 du règlement (UE) 2022/2065 (DSA) : explication motivée,
 * localisation précise (jeu, article), identité (e-mail) du signalant, déclaration de bonne foi, accusé de réception,
 * puis information du signalant sur la décision et son motif.
 */

/**
 * Catégories proposées au signalant. Reprennent les fondements de suspension qui s'appliquent à un contenu
 * (`SUSPENSION_GROUNDS` : illicite, fraude, non-respect des conditions, autre), plus deux catégories utiles aux joueurs.
 * `ground` : fondement prérempli dans le panneau de modération si l'équipe décide de suspendre le jeu.
 */
export const REPORT_CATEGORIES = {
  illegal_content: { label: SUSPENSION_GROUNDS.illegal_content, ground: 'illegal_content' },
  fraud: { label: 'Arnaque, fraude ou pratique commerciale trompeuse', ground: 'fraud' },
  minors: { label: 'Contenu inapproprié pour les mineurs', ground: 'terms_violation' },
  intellectual_property: { label: 'Atteinte à la propriété intellectuelle (contrefaçon, marque, droits d’auteur)', ground: 'illegal_content' },
  terms_violation: { label: 'Non-respect de la charte des contenus', ground: 'terms_violation' },
  other: { label: 'Autre', ground: 'other' },
} as const satisfies Record<string, { label: string; ground: SuspensionGround }>;
export type ReportCategory = keyof typeof REPORT_CATEGORIES;
const CATEGORY_KEYS = Object.keys(REPORT_CATEGORIES) as [ReportCategory, ...ReportCategory[]];

export function isReportCategory(value: unknown): value is ReportCategory {
  return typeof value === 'string' && Object.hasOwn(REPORT_CATEGORIES, value);
}

export function reportCategoryLabel(category: string): string {
  return isReportCategory(category) ? REPORT_CATEGORIES[category].label : category;
}

/** Libellé exact de la case de bonne foi (DSA art. 16, § 2, d), repris dans l'accusé de réception. */
export const GOOD_FAITH_LABEL =
  'Je déclare de bonne foi que les informations et allégations contenues dans ce signalement sont exactes et complètes.';

/** Page publique décrivant les contenus interdits et le signalement. */
export const CONTENT_POLICY_HREF = '/legal/cgu-studios#contenus-interdits';

export const EXPLANATION_MIN = 20;
export const EXPLANATION_MAX = 2000;

/** Cible de l'anti-doublon : l'article visé ou le jeu dans son ensemble. */
export const GAME_TARGET = 'game';
export function reportTarget(itemId: string | null | undefined): string {
  return itemId ? itemId : GAME_TARGET;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Formulaire du signalant. `email` est remplacé côté serveur par celui du compte si rien n'est saisi. */
export const reportInputSchema = z.object({
  category: z.enum(CATEGORY_KEYS, { error: 'Choisissez une catégorie.' }),
  explanation: z
    .string({ error: 'Expliquez pourquoi ce contenu est hors charte.' })
    .trim()
    .min(EXPLANATION_MIN, `Votre explication doit faire au moins ${EXPLANATION_MIN} caractères : décrivez précisément le problème.`)
    .max(EXPLANATION_MAX, `Votre explication ne doit pas dépasser ${EXPLANATION_MAX} caractères.`),
  itemId: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => (v ? v : null)),
  email: z
    .string({ error: 'Indiquez votre adresse e-mail.' })
    .trim()
    .min(1, 'Indiquez votre adresse e-mail : elle sert à vous envoyer l’accusé de réception et la décision.')
    .max(254, 'Adresse e-mail trop longue.')
    .email('Adresse e-mail invalide.')
    .transform(normalizeEmail),
  goodFaith: z.literal(true, { error: 'Cochez la déclaration de bonne foi pour envoyer le signalement.' }),
});
export type ReportInput = z.input<typeof reportInputSchema>;
export type ParsedReportInput = z.output<typeof reportInputSchema>;

/**
 * Limites de débit des signalements (fenêtre glissante, `rate-limit.ts`). Ouverts aux visiteurs : la limite par IP
 * est la protection principale ; celle par e-mail empêche d'utiliser le formulaire pour inonder une adresse
 * d'accusés de réception ; celle par compte freine un compte connecté qui change d'IP.
 */
export const REPORT_LIMITS = {
  perIpBurst: { max: 5, windowMs: 10 * 60_000 },
  perIpDay: { max: 20, windowMs: 24 * 60 * 60_000 },
  perEmailDay: { max: 5, windowMs: 24 * 60 * 60_000 },
  perAccountDay: { max: 10, windowMs: 24 * 60 * 60_000 },
} satisfies Record<string, RateRule>;

/* ------------------------------------------------------------------------------------------------
 * Décisions (back-office)
 * ---------------------------------------------------------------------------------------------- */

export const dismissReportsSchema = z.object({
  reason: z
    .string({ error: 'Le motif est obligatoire.' })
    .trim()
    .min(1, 'Le motif est obligatoire.')
    .min(REASON_MIN, `Le motif doit faire au moins ${REASON_MIN} caractères : il est communiqué tel quel aux signalants.`)
    .max(REASON_MAX, `Le motif ne doit pas dépasser ${REASON_MAX} caractères.`),
});

/** Fondement de suspension à préremplir : celui de la catégorie la plus signalée (à égalité, la plus grave d'abord). */
export function suggestedGround(categories: readonly string[]): SuspensionGround {
  const counts = new Map<SuspensionGround, number>();
  for (const c of categories) {
    if (!isReportCategory(c)) continue;
    const g = REPORT_CATEGORIES[c].ground;
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const order = Object.keys(SUSPENSION_GROUNDS) as SuspensionGround[];
  let best: SuspensionGround = 'other';
  let bestN = 0;
  for (const g of order) {
    const n = counts.get(g) ?? 0;
    if (n > bestN) {
      best = g;
      bestN = n;
    }
  }
  return best;
}

export function isSuspensionGround(value: unknown): value is SuspensionGround {
  return typeof value === 'string' && Object.hasOwn(SUSPENSION_GROUNDS, value);
}

export const REPORT_STATUS_LABELS = {
  open: 'Ouvert',
  dismissed: 'Classé sans suite',
  actioned: 'Jeu suspendu',
} as const;
