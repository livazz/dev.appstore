import { describe, expect, it } from 'vitest';
import { generateGameReviews, templatesForCategory } from './seed-reviews';

const now = new Date('2026-11-10T12:00:00Z');
const game = { id: 'gam_neon_drift', name: 'Neon Drift', category: 'Course' };

describe('avis de démo (seed)', () => {
  it('est déterministe : mêmes identifiants, notes et textes à chaque exécution', () => {
    expect(generateGameReviews(game, now)).toEqual(generateGameReviews(game, now));
  });

  it('produit 8 à 40 avis valides par jeu, notes majoritairement 4–5, dates sur 6 mois', () => {
    const all = ['gam_a', 'gam_b', 'gam_c', 'gam_d', 'gam_e', 'gam_f'].flatMap((id) => {
      const rows = generateGameReviews({ id, name: 'Jeu', category: 'Puzzle' }, now);
      expect(rows.length).toBeGreaterThanOrEqual(8);
      expect(rows.length).toBeLessThanOrEqual(40);
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
      return rows;
    });
    for (const r of all) {
      expect(r.rating).toBeGreaterThanOrEqual(1);
      expect(r.rating).toBeLessThanOrEqual(5);
      expect(r.body!.length).toBeGreaterThanOrEqual(10);
      expect(r.body!.length).toBeLessThanOrEqual(1000);
      expect(r.userId).toBeNull();
      const age = now.getTime() - r.createdAt!.getTime();
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThanOrEqual(181 * 86_400_000);
    }
    const high = all.filter((r) => r.rating >= 4).length / all.length;
    expect(high).toBeGreaterThan(0.6);
  });

  it('utilise des textes propres au genre (repli générique pour une catégorie inconnue)', () => {
    expect(templatesForCategory('Course').pos.join(' ')).toMatch(/circuit|drift|course/i);
    expect(templatesForCategory('stratégie')).toBe(templatesForCategory('Stratégie'));
    expect(templatesForCategory('Jeu de rôle')).toBe(templatesForCategory('RPG'));
    expect(templatesForCategory('Inconnue').pos.length).toBeGreaterThan(0);
  });
});
