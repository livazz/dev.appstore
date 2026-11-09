import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy, generateNonce } from '@/lib/security-headers';

/*
 * CSP à nonce par requête (vague 6, CHK-HDR-01).
 *
 * Next.js 15 (App Router) lit l'en-tête `Content-Security-Policy` de la *requête*, en extrait le nonce de script-src
 * et l'ajoute à tous les scripts qu'il émet (bootstrap, chunks, flux RSC inline). La même politique est renvoyée au
 * navigateur dans la réponse. `x-nonce` permet à un composant serveur de récupérer le nonce s'il doit poser un script.
 *
 * Le middleware ne touche ni à l'API (CSP minimale posée par next.config.ts, /api/uploads garde sa CSP sandbox), ni
 * aux fichiers statiques (_next/static, images, icônes, manifest, robots, sitemap, image Open Graph).
 * Les autres en-têtes de sécurité (HSTS, X-Frame-Options, Referrer-Policy…) restent posés par next.config.ts.
 */
export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const csp = contentSecurityPolicy(process.env.NODE_ENV !== 'production', nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    // Tout sauf : /api/*, /_next/* (statique, images, HMR), fichiers de métadonnées et fichiers de public/ à extension.
    '/((?!api/|_next/|favicon\\.ico|icon|apple-icon|opengraph-image|twitter-image|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|txt|xml|webmanifest|woff2?)$).*)',
  ],
};
