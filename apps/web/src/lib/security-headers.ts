/*
 * En-têtes de sécurité HTTP globaux (CHK-HDR-01, T-AUTH-07, T-UPL-05/06, D-20), appliqués par next.config.ts.
 * Module sans dépendance : importé par la configuration Next.js et testé par vitest.
 *
 * CSP des pages (vague 6) : `src/middleware.ts` génère un nonce par requête et pose
 * `script-src 'self' 'nonce-…' 'strict-dynamic'` ; Next.js (App Router) lit le nonce dans l'en-tête de la requête et
 * l'applique à ses propres scripts (hydratation, chunks). Plus de `'unsafe-inline'` pour les scripts : un script
 * injecté sans le nonce ne s'exécute pas. Les pages sont donc rendues dynamiquement (le layout racine lit les
 * en-têtes) : une page prérendue au build porterait un nonce figé.
 * `style-src` garde `'unsafe-inline'` : React (attributs style des boutiques), next/font et les dégradés de l'éditeur
 * en dépendent, et un nonce de style désactiverait les attributs style. Les styles ne peuvent pas exécuter de code.
 * Les autres directives sont strictes : aucune origine de script externe, pas de plugin, pas d'intégration en cadre
 * (clickjacking de « Est-ce bien vous ? », achat, intégration), formulaires vers le site et Stripe uniquement (Stripe
 * Checkout est une redirection de premier niveau, non soumise à la CSP). img-src accepte les data: (visuels de démo)
 * et https: (avatar renvoyé par le studio lors de la liaison) ; les visuels de boutique sont, eux, limités aux uploads
 * Dev AppStore côté serveur (studio-logic).
 * Routes /api/* (hors middleware) : CSP minimale `default-src 'none'` posée par next.config.ts (réponses JSON/SSE) ;
 * /api/uploads/* garde sa propre CSP sandbox (storage.ts).
 */

export interface HeaderEntry {
  key: string;
  value: string;
}

export interface HeaderRule {
  source: string;
  headers: HeaderEntry[];
}

/** Nonce CSP : 16 octets aléatoires en base64 (Web Crypto, disponible dans le runtime Edge du middleware). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * CSP des pages HTML. `nonce` (middleware) : scripts autorisés par nonce + 'strict-dynamic' (les chunks chargés par
 * un script de confiance héritent de la confiance) ; 'self' sert de repli aux navigateurs sans 'strict-dynamic'.
 */
export function contentSecurityPolicy(dev: boolean, nonce?: string): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // 'unsafe-eval' : uniquement en dev (React Refresh / HMR).
    'script-src': [
      "'self'",
      ...(nonce ? [`'nonce-${nonce}'`, "'strict-dynamic'"] : []),
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...(dev ? ['ws:', 'wss:'] : [])],
    'media-src': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", 'https://checkout.stripe.com', 'https://connect.stripe.com'],
    'frame-ancestors': ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  if (!dev) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}

/** CSP des réponses d'API (JSON, SSE, redirections) : rien à charger ni à exécuter, aucune intégration en cadre. */
export const API_CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/**
 * Règles `headers()` de next.config.ts. La CSP des pages est posée par le middleware (nonce par requête) ; ici, seule
 * la CSP des routes /api/* hors /api/uploads/* (qui gardent leur propre CSP sandbox, cf. storage.ts).
 */
export function securityHeaders(opts: { dev: boolean }): HeaderRule[] {
  const common: HeaderEntry[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    ...(opts.dev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
  ];
  return [
    { source: '/:path*', headers: common },
    // API sauf les fichiers téléversés (qui ont une CSP « default-src 'none'; sandbox »). Les pages : middleware.ts.
    { source: '/api/:path((?!uploads/).*)', headers: [{ key: 'Content-Security-Policy', value: API_CONTENT_SECURITY_POLICY }] },
  ];
}
