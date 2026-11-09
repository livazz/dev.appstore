import { describe, expect, it } from 'vitest';
import { DOC_PAGES } from './docs/nav';
import { LEGAL_DOCUMENTS } from './legal-versions';
import { docPageMetadata, openGraph, publicPageMetadata, robotsRules, siteUrl, sitemapEntries } from './seo';

const BASE = 'https://devappstore.com';

describe('siteUrl', () => {
  it('APP_URL sans « / » final, localhost par défaut', () => {
    expect(siteUrl('https://devappstore.com/')).toBe(BASE);
    expect(siteUrl(undefined)).toBe('http://localhost:3000');
    expect(siteUrl('  ')).toBe('http://localhost:3000');
  });
});

describe('robots.txt', () => {
  it('interdit les espaces privés, l’API et le paiement ; déclare le sitemap', () => {
    const r = robotsRules(BASE, 'published');
    const rule = Array.isArray(r.rules) ? r.rules[0]! : r.rules;
    expect(rule.disallow).toEqual(['/studio', '/admin', '/account', '/api', '/checkout']);
    expect(rule.allow).toBe('/');
    expect(r.sitemap).toBe(`${BASE}/sitemap.xml`);
  });

  it('pages légales interdites tant que LEGAL_STATUS = draft', () => {
    const rule = (s: 'draft' | 'published') => {
      const r = robotsRules(BASE, s).rules;
      return Array.isArray(r) ? r[0]! : r;
    };
    expect(rule('draft').disallow).toContain('/legal');
    expect(rule('published').disallow).not.toContain('/legal');
  });
});

describe('sitemap.xml', () => {
  const games = [{ slug: 'crystal-clash', updatedAt: new Date('2026-11-01T00:00:00Z') }, { slug: 'farm-story' }];

  it('accueil, page studios, toute la documentation et les jeux publiés', () => {
    const urls = sitemapEntries(BASE, games, 'draft').map((e) => e.url);
    expect(urls).toContain(`${BASE}/`);
    expect(urls).toContain(`${BASE}/pour-les-studios`);
    expect(urls).toContain(`${BASE}/docs`);
    for (const p of DOC_PAGES.filter((d) => d.slug)) expect(urls).toContain(`${BASE}/docs/${p.slug}`);
    expect(urls).toContain(`${BASE}/games/crystal-clash`);
    expect(urls).toContain(`${BASE}/games/farm-story`);
    const crystal = sitemapEntries(BASE, games, 'draft').find((e) => e.url.endsWith('/crystal-clash'))!;
    expect(crystal.lastModified).toEqual(games[0]!.updatedAt);
  });

  it('jamais les espaces privés ; pages légales seulement une fois publiées', () => {
    for (const status of ['draft', 'published'] as const) {
      const urls = sitemapEntries(BASE, games, status).map((e) => e.url);
      for (const u of urls) expect(u.slice(BASE.length)).not.toMatch(/^\/(studio|admin|account|checkout|api|search)(\/|$)/);
    }
    expect(sitemapEntries(BASE, games, 'draft').some((e) => e.url.includes('/legal'))).toBe(false);
    const published = sitemapEntries(BASE, games, 'published').map((e) => e.url);
    expect(published).toContain(`${BASE}/legal`);
    for (const d of LEGAL_DOCUMENTS) expect(published).toContain(`${BASE}${d.href}`);
  });

  it('slug encodé', () => {
    expect(sitemapEntries(BASE, [{ slug: 'a b' }], 'draft').map((e) => e.url)).toContain(`${BASE}/games/a%20b`);
  });
});

describe('metadata', () => {
  it('Open Graph commun conservé quand une page en définit un', () => {
    expect(openGraph({ url: '/x' })).toMatchObject({ siteName: 'Dev AppStore', locale: 'fr_FR', type: 'website', url: '/x' });
    expect(openGraph({ url: '/x' }).images).toEqual([expect.objectContaining({ url: '/opengraph-image', width: 1200, height: 630 })]);
    expect(openGraph({ images: [{ url: 'https://cdn/x.png' }] }).images).toEqual([{ url: 'https://cdn/x.png' }]);
  });

  it('page publique : canonical, OG, titre complété par le gabarit', () => {
    const m = publicPageMetadata({ title: 'Studios', description: 'd', path: '/pour-les-studios' });
    expect(m.title).toBe('Studios');
    expect(m.alternates?.canonical).toBe('/pour-les-studios');
    expect(m.openGraph).toMatchObject({ title: 'Studios · Dev AppStore', url: '/pour-les-studios' });
  });

  it('documentation : « Titre · Documentation · Dev AppStore »', () => {
    const m = docPageMetadata('api');
    expect(m.title).toEqual({ absolute: expect.stringMatching(/ · Documentation · Dev AppStore$/) });
    expect(m.alternates?.canonical).toBe('/docs/api');
    expect(docPageMetadata('').alternates?.canonical).toBe('/docs');
  });
});
