import { describe, expect, it } from 'vitest';
import {
  CGV_URL,
  CGV_VERSION,
  LEGAL_DOCUMENTS,
  LEGAL_SLUGS,
  formatLegalDate,
  getLegalDocument,
  isLegalSlug,
  isLegalVersion,
  legalAcceptance,
  legalVersionLabel,
} from './legal-versions';

describe('legal-versions', () => {
  it('déclare un document par identifiant, avec une version ISO valide et une URL /legal/<slug>', () => {
    expect(LEGAL_DOCUMENTS.map((d) => d.slug)).toEqual([...LEGAL_SLUGS]);
    for (const doc of LEGAL_DOCUMENTS) {
      expect(isLegalVersion(doc.version), doc.slug).toBe(true);
      expect(doc.href).toBe(`/legal/${doc.slug}`);
      expect(doc.title).not.toMatch(/wolleen/i);
    }
  });

  it('expose la version et l’URL des CGV pour le checkout', () => {
    expect(CGV_URL).toBe('/legal/cgv');
    expect(getLegalDocument('cgv').version).toBe(CGV_VERSION);
  });

  it('valide les versions datées', () => {
    expect(isLegalVersion('2026-11-09')).toBe(true);
    expect(isLegalVersion('2028-02-29')).toBe(true);
    expect(isLegalVersion('2026-02-30')).toBe(false);
    expect(isLegalVersion('2026-13-01')).toBe(false);
    expect(isLegalVersion('9/11/2026')).toBe(false);
    expect(isLegalVersion('2026-11-09T00:00:00Z')).toBe(false);
  });

  it('formate une version en date française, sans dépendre du fuseau', () => {
    expect(formatLegalDate('2026-11-09')).toBe('9 novembre 2026');
    expect(formatLegalDate('2027-08-01')).toBe('1er août 2027');
    expect(formatLegalDate('2026-12-31')).toBe('31 décembre 2026');
    expect(() => formatLegalDate('demain')).toThrow(/invalide/);
    expect(legalVersionLabel('cgv')).toBe(`Version du ${formatLegalDate(CGV_VERSION)}`);
  });

  it('reconnaît les identifiants connus', () => {
    expect(isLegalSlug('cookies')).toBe(true);
    expect(isLegalSlug('cgu')).toBe(false);
    expect(() => getLegalDocument('inconnu' as never)).toThrow(/inconnu/);
  });

  it('construit l’enregistrement d’acceptation à stocker avec la commande', () => {
    const at = new Date('2026-11-10T08:30:00.000Z');
    expect(legalAcceptance('cgv', at)).toEqual({
      document: 'cgv',
      version: CGV_VERSION,
      url: '/legal/cgv',
      acceptedAt: '2026-11-10T08:30:00.000Z',
    });
    expect(legalAcceptance('cgv', at, 'https://devappstore.example/').url).toBe('https://devappstore.example/legal/cgv');
  });
});
