import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DOC_GROUPS, DOC_PAGES, docHref, docNeighbours, getDocPage } from './nav';
import { buildSearchIndex, normalize, searchDocs } from './search';

const appDir = fileURLToPath(new URL('../../app/(docs)/docs/', import.meta.url));
const pageFile = (slug: string) => `${appDir}${slug ? `${slug}/` : ''}page.tsx`;

describe('plan de la documentation', () => {
  it('chaque page déclarée a son fichier page.tsx', () => {
    for (const p of DOC_PAGES) expect(existsSync(pageFile(p.slug)), p.slug || '(accueil)').toBe(true);
  });

  it('chaque section du sommaire a une ancre id="…" dans sa page', () => {
    for (const p of DOC_PAGES) {
      const src = readFileSync(pageFile(p.slug), 'utf8');
      for (const s of p.sections) expect(src, `${p.slug}#${s.id}`).toContain(`id="${s.id}"`);
    }
  });

  it('slugs et ancres uniques', () => {
    const slugs = DOC_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const p of DOC_PAGES) {
      const ids = p.sections.map((s) => s.id);
      expect(new Set(ids).size, p.slug).toBe(ids.length);
    }
  });

  it('chaque page appartient à un groupe connu et utilise sa coquille DocPage', () => {
    for (const p of DOC_PAGES) {
      expect(DOC_GROUPS).toContain(p.group);
      expect(readFileSync(pageFile(p.slug), 'utf8')).toContain(`<DocPage slug="${p.slug}">`);
    }
  });

  it('docHref, getDocPage et docNeighbours', () => {
    expect(docHref('')).toBe('/docs');
    expect(docHref('api', 'post-ack')).toBe('/docs/api#post-ack');
    expect(getDocPage('webhooks').title).toBe('Webhooks');
    expect(() => getDocPage('inconnue')).toThrow();
    expect(docNeighbours('').prev).toBeNull();
    expect(docNeighbours('').next?.slug).toBe('demarrage-rapide');
    expect(docNeighbours('api').next).toBeNull();
    expect(docNeighbours('inconnue')).toEqual({ prev: null, next: null });
  });
});

describe('recherche côté client', () => {
  const index = buildSearchIndex();

  it('normalise casse, accents et ponctuation', () => {
    expect(normalize('  Démarrage   RAPIDE ! ')).toBe('demarrage rapide');
    expect(normalize('« id_confirm »')).toBe('id_confirm');
  });

  it('indexe une entrée par page et par section', () => {
    const expected = DOC_PAGES.reduce((n, p) => n + 1 + p.sections.length, 0);
    expect(index).toHaveLength(expected);
  });

  it('trouve sans accents et classe le titre en premier', () => {
    const r = searchDocs('demarrage', index);
    expect(r[0]).toMatchObject({ href: '/docs/demarrage-rapide', page: '' });
  });

  it('trouve par mot-clé technique', () => {
    expect(searchDocs('hmac', index).some((r) => r.href === '/docs/webhooks#signature')).toBe(true);
    expect(searchDocs('DevAppStore-Signature', index).length).toBeGreaterThan(0);
    expect(searchDocs('acknowledged', index)[0].href).toBe('/docs/concepts#statuts');
    expect(searchDocs('python', index).some((r) => r.href === '/docs/webhooks#verification')).toBe(true);
  });

  it('exige tous les mots de la requête', () => {
    const r = searchDocs('remboursement refund', index);
    expect(r[0].href).toBe('/docs/concepts#remboursements');
    expect(searchDocs('remboursement zzzz', index)).toEqual([]);
  });

  it('requête vide → aucun résultat ; limite respectée', () => {
    expect(searchDocs('   ', index)).toEqual([]);
    expect(searchDocs('e', index, 3)).toHaveLength(3);
  });
});
