import type { MetadataRoute } from 'next';
import { BRAND_BG, BRAND_YELLOW, SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo';

/** /manifest.webmanifest : nom, couleurs de la marque (carré jaune « D ») et icônes. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — achats in-app sur le web`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: 'fr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: BRAND_BG,
    theme_color: BRAND_YELLOW,
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { src: '/icon-512.png', type: 'image/png', sizes: '512x512' },
      { src: '/icon-maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
    ],
  };
}
