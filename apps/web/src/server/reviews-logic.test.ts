import { describe, expect, it } from 'vitest';
import {
  REVIEW_BODY_MAX,
  breakdownFromCounts,
  breakdownFromRatings,
  formatAverage,
  normalizeReviewBody,
  parseReviewPage,
  publicAuthorName,
  relativeDate,
  reviewInputSchema,
  reviewModerationSchema,
  sharePct,
  starFill,
  totalPages,
} from './reviews-logic';

describe('validation de la saisie', () => {
  it('accepte une note 1–5 (y compris en texte de formulaire) et un texte de 10 à 1000 caractères', () => {
    const r = reviewInputSchema.safeParse({ rating: '4', body: '  Très bon jeu, je recommande.  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ rating: 4, body: 'Très bon jeu, je recommande.' });
  });

  it.each([['0'], ['6'], ['3.5'], [''], ['abc'], [undefined]])('refuse la note %s', (rating) => {
    const r = reviewInputSchema.safeParse({ rating, body: 'Un avis assez long.' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toContain('note de 1 à 5');
  });

  it('refuse un texte trop court (après normalisation) ou trop long', () => {
    const short = reviewInputSchema.safeParse({ rating: 5, body: '   court ​​   ' });
    expect(short.success).toBe(false);
    if (!short.success) expect(short.error.issues[0]!.message).toContain('au moins 10');
    const long = reviewInputSchema.safeParse({ rating: 5, body: 'a'.repeat(REVIEW_BODY_MAX + 1) });
    expect(long.success).toBe(false);
    if (!long.success) expect(long.error.issues[0]!.message).toContain('1000');
    expect(reviewInputSchema.safeParse({ rating: 5, body: 'a'.repeat(REVIEW_BODY_MAX) }).success).toBe(true);
    expect(reviewInputSchema.safeParse({ rating: 5, body: 42 }).success).toBe(false);
  });

  it('conserve le HTML comme du texte brut (rendu échappé par React), sans caractères invisibles', () => {
    const r = reviewInputSchema.parse({ rating: 1, body: '<script>alert(1)</script>‮gnp.exe' });
    expect(r.body).toBe('<script>alert(1)</script>gnp.exe');
  });

  it('normalise espaces, retours à la ligne et lignes vides', () => {
    expect(normalizeReviewBody('a\r\n\r\n\r\n\r\nb\t\tc   d\u0007')).toBe('a\n\nb c d');
    expect(normalizeReviewBody('  ligne 1  \n   ligne 2 ')).toBe('ligne 1\nligne 2');
  });

  it('valide le statut de modération et normalise le motif', () => {
    expect(reviewModerationSchema.parse({ status: 'hidden', reason: '  insultes  ' })).toEqual({ status: 'hidden', reason: 'insultes' });
    expect(reviewModerationSchema.parse({ status: 'visible' })).toEqual({ status: 'visible', reason: '' });
    expect(reviewModerationSchema.safeParse({ status: 'deleted' }).success).toBe(false);
  });
});

describe('moyenne et répartition', () => {
  it('calcule moyenne (au dixième), nombre et répartition', () => {
    const b = breakdownFromRatings([5, 5, 4, 3, 1, 5]);
    expect(b).toEqual({ average: 3.8, count: 6, distribution: { 1: 1, 2: 0, 3: 1, 4: 1, 5: 3 } });
    expect(sharePct(b, 5)).toBe(50);
    expect(sharePct(b, 2)).toBe(0);
  });

  it('agrège des comptes par note et ignore les valeurs hors 1–5', () => {
    const b = breakdownFromCounts([
      { rating: 5, count: 10 },
      { rating: 4, count: 5 },
      { rating: 0, count: 3 },
      { rating: 7, count: 2 },
      { rating: 2, count: 0 },
    ]);
    expect(b.count).toBe(15);
    expect(b.average).toBe(4.7);
  });

  it('sans avis : moyenne 0, parts à 0', () => {
    const b = breakdownFromRatings([]);
    expect(b).toEqual({ average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
    expect(sharePct(b, 5)).toBe(0);
  });

  it('formate la moyenne à la française et arrondit les étoiles à la demie', () => {
    expect(formatAverage(4.3)).toBe('4,3');
    expect(formatAverage(5)).toBe('5,0');
    expect(starFill(4.3)).toEqual(['full', 'full', 'full', 'full', 'half']);
    expect(starFill(4.2)).toEqual(['full', 'full', 'full', 'full', 'empty']);
    expect(starFill(0)).toEqual(Array(5).fill('empty'));
    expect(starFill(9)).toEqual(Array(5).fill('full'));
  });
});

describe('affichage', () => {
  it('nom public : prénom + initiale, jamais une adresse e-mail', () => {
    expect(publicAuthorName('Ali Mehrez')).toBe('Ali M.');
    expect(publicAuthorName('jean-paul de la tour')).toBe('jean-paul T.');
    expect(publicAuthorName('Zoé')).toBe('Zoé');
    expect(publicAuthorName('joueur@exemple.test')).toBe('Joueur');
    expect(publicAuthorName('   ')).toBe('Joueur');
    expect(publicAuthorName(null)).toBe('Joueur');
  });

  it('date relative en français', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    const ago = (ms: number) => relativeDate(new Date(now.getTime() - ms), now);
    expect(ago(10_000)).toBe('à l’instant');
    expect(ago(5 * 60_000)).toBe('il y a 5 minutes');
    expect(ago(3 * 3600_000)).toBe('il y a 3 heures');
    expect(ago(86_400_000)).toBe('hier');
    expect(ago(14 * 86_400_000)).toBe('il y a 2 semaines');
    expect(ago(90 * 86_400_000)).toBe('il y a 3 mois');
  });

  it('pagination', () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(10)).toBe(1);
    expect(totalPages(11)).toBe(2);
    expect(parseReviewPage('3')).toBe(3);
    expect(parseReviewPage('-1')).toBe(1);
    expect(parseReviewPage('x')).toBe(1);
  });
});
