import type { MetadataRoute } from 'next';
import { env } from '@/env';
import { robotsRules, siteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';

/** /robots.txt : espaces privés, API et paiement interdits ; /legal tant que LEGAL_STATUS = 'draft'. */
export default function robots(): MetadataRoute.Robots {
  return robotsRules(siteUrl(env.APP_URL));
}
