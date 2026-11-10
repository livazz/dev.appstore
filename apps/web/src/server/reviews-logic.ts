import { z } from 'zod';

/*
 * Avis des joueurs — règles pures (sans base ni session), importables côté client : validation de la saisie,
 * normalisation du texte, synthèse des notes (moyenne, répartition), nom affiché, date relative.
 *
 * Le texte est stocké en texte brut et toujours rendu comme du texte par React (jamais de HTML interprété) ;
 * la normalisation retire en plus les caractères de contrôle et les caractères invisibles de mise en forme
 * (bidi, largeur nulle) qui servent à maquiller un contenu.
 */

export const REVIEW_BODY_MIN = 10;
export const REVIEW_BODY_MAX = 1000;
export const REVIEWS_PAGE_SIZE = 10;
export const RATINGS = [5, 4, 3, 2, 1] as const;
export type Rating = 1 | 2 | 3 | 4 | 5;

/** Limites de débit des écritures (création, modification, suppression), par compte et par IP. */
export const REVIEW_LIMITS = {
  perUserBurst: { max: 5, windowMs: 10 * 60_000 },
  perUserDay: { max: 30, windowMs: 24 * 60 * 60_000 },
  perIpHour: { max: 30, windowMs: 60 * 60_000 },
} as const;

/** Libellés des notes (étoiles du formulaire, lecteurs d'écran). */
export const RATING_LABELS: Record<Rating, string> = {
  1: 'Très décevant',
  2: 'Décevant',
  3: 'Correct',
  4: 'Très bien',
  5: 'Excellent',
};

// Caractères de contrôle (sauf saut de ligne et tabulation) et caractères invisibles de mise en forme.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g;

/** Texte d'avis normalisé : NFC, sans caractères invisibles, espaces et lignes vides compactés. */
export function normalizeReviewBody(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(/\t/g, ' ')
    .replace(/[  ]{2,}/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const reviewInputSchema = z.object({
  rating: z.coerce
    .number({ error: 'Choisissez une note de 1 à 5 étoiles.' })
    .int('Choisissez une note de 1 à 5 étoiles.')
    .min(1, 'Choisissez une note de 1 à 5 étoiles.')
    .max(5, 'Choisissez une note de 1 à 5 étoiles.'),
  body: z
    .string({ error: 'Écrivez votre avis.' })
    .max(REVIEW_BODY_MAX * 2, `Votre avis ne doit pas dépasser ${REVIEW_BODY_MAX} caractères.`)
    .transform(normalizeReviewBody)
    .pipe(
      z
        .string()
        .min(REVIEW_BODY_MIN, `Votre avis doit faire au moins ${REVIEW_BODY_MIN} caractères.`)
        .max(REVIEW_BODY_MAX, `Votre avis ne doit pas dépasser ${REVIEW_BODY_MAX} caractères.`),
    ),
});

export type ReviewInput = z.input<typeof reviewInputSchema>;
export type ValidReview = z.output<typeof reviewInputSchema>;

export const reviewModerationSchema = z.object({
  status: z.enum(['visible', 'hidden'], { error: 'Statut inconnu.' }),
  reason: z
    .string()
    .max(500, 'Motif trop long (500 caractères au plus).')
    .optional()
    .transform((s) => (s ? normalizeReviewBody(s) : '')),
});

/* ------------------------------------------------------------------------------------------------
 * Synthèse des notes
 * ---------------------------------------------------------------------------------------------- */

export interface RatingSummary {
  /** Moyenne arrondie au dixième (0 sans avis). */
  average: number;
  count: number;
}

export interface RatingBreakdown extends RatingSummary {
  /** Nombre d'avis par note (clés 1 à 5, toujours présentes). */
  distribution: Record<Rating, number>;
}

export const EMPTY_SUMMARY: RatingSummary = Object.freeze({ average: 0, count: 0 }) as RatingSummary;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Synthèse à partir des nombres d'avis par note (les notes hors 1–5 sont ignorées). */
export function breakdownFromCounts(counts: Iterable<{ rating: number; count: number }>): RatingBreakdown {
  const distribution: Record<Rating, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;
  for (const { rating, count } of counts) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !(count > 0)) continue;
    distribution[rating as Rating] += count;
    total += count;
    sum += rating * count;
  }
  return { average: total ? round1(sum / total) : 0, count: total, distribution };
}

/** Synthèse à partir d'une liste de notes. */
export function breakdownFromRatings(ratings: readonly number[]): RatingBreakdown {
  return breakdownFromCounts(ratings.map((rating) => ({ rating, count: 1 })));
}

/** Part (0–100, entier) des avis ayant cette note. */
export function sharePct(b: RatingBreakdown, rating: Rating): number {
  return b.count ? Math.round((b.distribution[rating] / b.count) * 100) : 0;
}

const avgFmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** « 4,3 » */
export function formatAverage(average: number): string {
  return avgFmt.format(average);
}

/** « 1 avis », « 12 avis », « 1 234 avis » */
export function formatReviewCount(n: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(n)} avis`;
}

/** Étoiles pleines, demi-étoile, vides pour l'affichage (arrondi à la demi-étoile). */
export function starFill(average: number): ('full' | 'half' | 'empty')[] {
  const halves = Math.round(Math.min(5, Math.max(0, average)) * 2);
  return [1, 2, 3, 4, 5].map((i) => (halves >= i * 2 ? 'full' : halves === i * 2 - 1 ? 'half' : 'empty'));
}

/* ------------------------------------------------------------------------------------------------
 * Affichage
 * ---------------------------------------------------------------------------------------------- */

/**
 * Nom affiché d'un auteur : prénom + initiale du nom (« Ali M. »), pour ne pas exposer le nom complet du compte.
 * Un nom vide ou ressemblant à une adresse e-mail devient « Joueur ».
 */
export function publicAuthorName(name: string | null | undefined): string {
  const clean = normalizeReviewBody(name ?? '').replace(/\n/g, ' ');
  if (!clean || clean.includes('@')) return 'Joueur';
  const parts = clean.split(/\s+/).filter(Boolean);
  const first = parts[0]!.slice(0, 24);
  const last = parts.length > 1 ? parts[parts.length - 1]! : '';
  const initial = last ? `${[...last][0]!.toLocaleUpperCase('fr-FR')}.` : '';
  return initial ? `${first} ${initial}` : first;
}

const rtf = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });

/** « à l’instant », « il y a 3 heures », « hier », « il y a 2 mois »… */
export function relativeDate(date: Date, now: Date = new Date()): string {
  const s = Math.round((date.getTime() - now.getTime()) / 1000);
  const a = Math.abs(s);
  if (a < 60) return 'à l’instant';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86_400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 7 * 86_400) return rtf.format(Math.round(s / 86_400), 'day');
  if (a < 30 * 86_400) return rtf.format(Math.round(s / (7 * 86_400)), 'week');
  if (a < 365 * 86_400) return rtf.format(Math.round(s / (30 * 86_400)), 'month');
  return rtf.format(Math.round(s / (365 * 86_400)), 'year');
}

/** Numéro de page valide (1 par défaut, borné). */
export function parseReviewPage(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : typeof value === 'number' ? value : 1;
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 10_000) : 1;
}

export function totalPages(count: number, pageSize = REVIEWS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(count / pageSize));
}
