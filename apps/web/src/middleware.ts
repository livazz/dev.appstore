import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy, generateNonce } from '@/lib/security-headers';
import { publicS3Origin } from '@/components/store/style-safety';

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
  const s3 = publicS3Origin();
  const csp = contentSecurityPolicy(process.env.NODE_ENV !== 'production', nonce, s3 ? [s3] : []);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    // Tout sauf : /api/*, /_next/* (statique, images, HMR) et les fichiers de métadonnées / de public/ nommés
    // EXPLICITEMENT (revue 2026-11, C-08 : une simple extension en fin de chemin — /games/x.png — ne prive plus une
    // page de sa CSP). Fichier ajouté à public/ → l'ajouter ici (sinon il reçoit simplement une CSP, sans effet).
    '/((?!(?:api|_next)/|(?:favicon\\.ico|icon(?:[-.][\\w.-]+)?|apple-icon(?:[-.][\\w.-]+)?|opengraph-image(?:[-.][\\w.-]+)?|twitter-image(?:[-.][\\w.-]+)?|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml)$).*)',
  ],
};
