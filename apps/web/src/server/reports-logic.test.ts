import { describe, expect, it } from 'vitest';
import { SUSPENSION_GROUNDS, auditActionLabel, can, rolesFor } from './admin-logic';
import {
  REPORT_CATEGORIES,
  isReportCategory,
  isSuspensionGround,
  normalizeEmail,
  reportCategoryLabel,
  reportInputSchema,
  reportTarget,
  suggestedGround,
} from './reports-logic';

describe('catégories de signalement', () => {
  it('chaque catégorie renvoie à un fondement de suspension existant', () => {
    for (const c of Object.values(REPORT_CATEGORIES)) expect(Object.keys(SUSPENSION_GROUNDS)).toContain(c.ground);
  });

  it('reprend les fondements qui s’appliquent à un contenu, sans ceux qui n’en relèvent pas', () => {
    expect(Object.keys(REPORT_CATEGORIES)).toEqual(expect.arrayContaining(['illegal_content', 'fraud', 'terms_violation', 'minors', 'intellectual_property', 'other']));
    expect(isReportCategory('delivery_failures')).toBe(false);
    expect(isReportCategory('legal_request')).toBe(false);
    expect(isReportCategory('toString')).toBe(false);
    expect(reportCategoryLabel('minors')).toBe('Contenu inapproprié pour les mineurs');
    expect(reportCategoryLabel('inconnue')).toBe('inconnue');
  });

  it('suggère le fondement de la catégorie la plus signalée, le plus grave à égalité', () => {
    expect(suggestedGround([])).toBe('other');
    expect(suggestedGround(['fraud', 'fraud', 'illegal_content'])).toBe('fraud');
    expect(suggestedGround(['intellectual_property', 'fraud'])).toBe('illegal_content');
    expect(suggestedGround(['minors', 'terms_violation', 'fraud'])).toBe('terms_violation');
    expect(suggestedGround(['bidon'])).toBe('other');
    expect(isSuspensionGround('fraud')).toBe(true);
    expect(isSuspensionGround('constructor')).toBe(false);
    expect(isSuspensionGround(['fraud'])).toBe(false);
  });
});

describe('formulaire de signalement', () => {
  const ok = { category: 'fraud', explanation: '  Prix barré fictif sur tous les packs de gemmes.  ', email: ' Moi@Exemple.TEST ', goodFaith: true };

  it('normalise l’e-mail et l’explication, article vide = jeu entier', () => {
    const r = reportInputSchema.parse({ ...ok, itemId: '' });
    expect(r).toEqual({ category: 'fraud', explanation: 'Prix barré fictif sur tous les packs de gemmes.', email: 'moi@exemple.test', itemId: null, goodFaith: true });
    expect(reportTarget(r.itemId)).toBe('game');
    expect(reportTarget('itm_1')).toBe('itm_1');
    expect(normalizeEmail(' A@B.C ')).toBe('a@b.c');
  });

  it('borne l’explication à 20–2000 caractères (espaces exclus) et exige la bonne foi', () => {
    expect(reportInputSchema.safeParse({ ...ok, explanation: `   ${'a'.repeat(19)}   ` }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...ok, explanation: 'a'.repeat(20) }).success).toBe(true);
    expect(reportInputSchema.safeParse({ ...ok, explanation: 'a'.repeat(2000) }).success).toBe(true);
    expect(reportInputSchema.safeParse({ ...ok, explanation: 'a'.repeat(2001) }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...ok, goodFaith: false }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...ok, goodFaith: 'on' }).success).toBe(false);
  });
});

describe('permission reports.moderate', () => {
  it('superadmin et support seulement', () => {
    expect(rolesFor('reports.moderate')).toEqual(['superadmin', 'support']);
    expect(can('finance', 'reports.moderate')).toBe(false);
    expect(can(null, 'reports.moderate')).toBe(false);
    expect(auditActionLabel('reports.dismiss')).toBe('Signalements classés sans suite');
  });
});
