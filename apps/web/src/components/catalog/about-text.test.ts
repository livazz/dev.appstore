import { describe, expect, it } from 'vitest';
import { foldParagraphs, splitParagraphs } from './about-text';
import { isoToLocalInput, localInputToIso } from '@/lib/datetime-local';

describe('splitParagraphs / foldParagraphs', () => {
  it('découpe sur les lignes vides et ignore les paragraphes vides', () => {
    expect(splitParagraphs('Un\nsuite\r\n\r\nDeux\n \n\n\nTrois\n')).toEqual(['Un\nsuite', 'Deux', 'Trois']);
    expect(splitParagraphs('   ')).toEqual([]);
  });

  it('replie au-delà du premier paragraphe (ou des deux premiers s’ils sont courts)', () => {
    expect(foldParagraphs('Seul')).toEqual({ visible: ['Seul'], hidden: [] });
    expect(foldParagraphs('A\n\nB\n\nC')).toEqual({ visible: ['A', 'B'], hidden: ['C'] });
    expect(foldParagraphs('A\n\nB')).toEqual({ visible: ['A', 'B'], hidden: [] });
    const long = 'x'.repeat(400);
    expect(foldParagraphs(`${long}\n\nB\n\nC`)).toEqual({ visible: [long], hidden: ['B', 'C'] });
  });
});

describe('datetime-local ↔ ISO', () => {
  it('fait l’aller-retour en heure locale', () => {
    const iso = localInputToIso('2026-12-01T09:30')!;
    expect(isoToLocalInput(iso)).toBe('2026-12-01T09:30');
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso('n’importe quoi')).toBeNull();
    expect(isoToLocalInput(null)).toBe('');
    expect(isoToLocalInput('pas une date')).toBe('');
  });
});
