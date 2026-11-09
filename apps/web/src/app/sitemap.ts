import type { MetadataRoute } from 'next';
import { db, eq, games } from '@devappstore/db';
import { env } from '@/env';
import { siteUrl, sitemapEntries } from '@/lib/seo';

// Lit les jeux publiés à chaque requête (jamais au build : pas d'accès base pendant la collecte des pages).
export const dynamic = 'force-dynamic';

/** /sitemap.xml : pages publiques et jeux publiés (règles dans lib/seo.ts). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const live = await db.select({ slug: games.slug, updatedAt: games.updatedAt }).from(games).where(eq(games.status, 'live'));
  return sitemapEntries(siteUrl(env.APP_URL), live);
}
