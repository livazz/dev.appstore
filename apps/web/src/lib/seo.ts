/**
 * Référencement (vague 6) : nom du site, URL publique, metadata communes, règles du sitemap et de robots.txt.
 * Fonctions pures (testées par seo.test.ts) ; les fichiers app/{sitemap,robots,manifest}.ts et les layouts s'en servent.
 */
import type { Metadata, MetadataRoute } from 'next';
import { DOC_PAGES, docHref, getDocPage } from './docs/nav';
import { LEGAL_DOCUMENTS, LEGAL_STATUS } from './legal-versions';

export const SITE_NAME = 'Dev AppStore';
export const SITE_DESCRIPTION =
  'Trouvez votre jeu, liez votre compte et achetez vos objets in-app moins cher qu’en jeu. Livraison automatique dans le jeu.';
/** Couleurs de la marque (globals.css : --brand, --ink, --bg). */
export const BRAND_YELLOW = '#ffd43b';
export const BRAND_INK = '#1d1d1f';
export const BRAND_BG = '#f5f5f7';

/** URL publique du site, sans « / » final (APP_URL, obligatoire en production ; localhost en développement). */
export function siteUrl(appUrl: string | undefined = process.env.APP_URL): string {
  return (appUrl?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
}

/** Image Open Graph par défaut (app/opengraph-image.tsx). */
export const DEFAULT_OG_IMAGE = { url: '/opengraph-image', width: 1200, height: 630, alt: `${SITE_NAME} — vos achats in-app moins cher, sur le web` };

/**
 * Open Graph commun. Une page qui définit `openGraph` remplace tout l'objet hérité, image générée comprise : elle
 * passe par ce helper, qui remet le nom du site, la langue et l'image par défaut si elle n'en fournit pas.
 */
export function openGraph(extra: NonNullable<Metadata['openGraph']> = {}): NonNullable<Metadata['openGraph']> {
  const { images, ...rest } = extra;
  return { siteName: SITE_NAME, locale: 'fr_FR', type: 'website', ...rest, images: images ?? [DEFAULT_OG_IMAGE] };
}

/** Metadata d'une page publique : titre (complété par le gabarit « %s · Dev AppStore »), description, canonical, OG. */
export function publicPageMetadata(opts: { title: string; description: string; path: string; absoluteTitle?: boolean }): Metadata {
  const title = opts.absoluteTitle ? { absolute: opts.title } : opts.title;
  const ogTitle = opts.absoluteTitle ? opts.title : `${opts.title} · ${SITE_NAME}`;
  return {
    title,
    description: opts.description,
    alternates: { canonical: opts.path },
    openGraph: openGraph({ title: ogTitle, description: opts.description, url: opts.path }),
  };
}

/** Pages de documentation : « API · Documentation · Dev AppStore ». */
export function docPageMetadata(slug: string): Metadata {
  const page = getDocPage(slug);
  return publicPageMetadata({
    title: slug ? `${page.title} · Documentation · ${SITE_NAME}` : `Documentation développeur · ${SITE_NAME}`,
    absoluteTitle: true,
    description: page.description,
    path: docHref(slug),
  });
}

/** Préfixes jamais explorés ni indexés (espaces privés, API, paiement). */
export const PRIVATE_PREFIXES = ['/studio', '/admin', '/account', '/api', '/checkout'] as const;

/** Les pages légales ne sont indexées qu'une fois publiées (bandeau « Projet » tant que LEGAL_STATUS = 'draft'). */
export function legalIndexable(status: 'draft' | 'published' = LEGAL_STATUS): boolean {
  return status === 'published';
}

export function robotsRules(base: string, status: 'draft' | 'published' = LEGAL_STATUS): MetadataRoute.Robots {
  // Règle par préfixe : « /studio » couvre /studio, /studio/… (dont /studio/signup, aussi en noindex).
  const disallow: string[] = [...PRIVATE_PREFIXES];
  if (!legalIndexable(status)) disallow.push('/legal');
  return {
    rules: [{ userAgent: '*', allow: '/', disallow }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}

export interface SitemapGame {
  slug: string;
  updatedAt?: Date | null;
}

/**
 * Pages publiques : accueil, page studios, documentation, jeux publiés (live) et, une fois publiées, pages légales.
 * Jamais /studio, /admin, /account, /checkout (ni /search, page de résultats).
 */
export function sitemapEntries(base: string, games: SitemapGame[], status: 'draft' | 'published' = LEGAL_STATUS): MetadataRoute.Sitemap {
  const url = (path: string) => (path === '/' ? `${base}/` : `${base}${path}`);
  const entries: MetadataRoute.Sitemap = [
    { url: url('/'), changeFrequency: 'daily', priority: 1 },
    { url: url('/pour-les-studios'), changeFrequency: 'monthly', priority: 0.8 },
    ...DOC_PAGES.map((p) => ({ url: url(docHref(p.slug)), changeFrequency: 'monthly' as const, priority: p.slug ? 0.5 : 0.6 })),
    ...games.map((g) => ({
      url: url(`/games/${encodeURIComponent(g.slug)}`),
      ...(g.updatedAt ? { lastModified: g.updatedAt } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
  ];
  if (legalIndexable(status)) {
    entries.push({ url: url('/legal'), changeFrequency: 'yearly', priority: 0.2 });
    for (const d of LEGAL_DOCUMENTS) entries.push({ url: url(d.href), lastModified: new Date(d.version), changeFrequency: 'yearly', priority: 0.2 });
  }
  return entries;
}
