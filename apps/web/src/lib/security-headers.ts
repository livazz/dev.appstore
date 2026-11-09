/*
 * En-têtes de sécurité HTTP globaux (CHK-HDR-01, T-AUTH-07, T-UPL-05/06, D-20), appliqués par next.config.ts.
 * Module sans dépendance : importé par la configuration Next.js et testé par vitest.
 *
 * CSP : sans middleware de nonce, Next.js (App Router) injecte des scripts inline d'hydratation : `'unsafe-inline'`
 * reste nécessaire pour script-src. Les autres directives sont strictes : aucune origine de script externe, pas de
 * plugin, pas d'intégration en cadre (clickjacking de « Est-ce bien vous ? », achat, intégration), formulaires vers
 * le site et Stripe uniquement. img-src accepte les data: (visuels de démo) et https: (avatar renvoyé par le studio
 * lors de la liaison) ; les visuels de boutique sont, eux, limités aux uploads Dev AppStore côté serveur (studio-logic).
 */

export interface HeaderEntry {
  key: string;
  value: string;
}

export interface HeaderRule {
  source: string;
  headers: HeaderEntry[];
}

export function contentSecurityPolicy(dev: boolean): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // 'unsafe-eval' : uniquement en dev (React Refresh / HMR).
    'script-src': ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
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

/** Règles `headers()` de next.config.ts. Les fichiers /api/uploads/* gardent leur propre CSP (sandbox, cf. storage.ts). */
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
    // Toutes les routes sauf les fichiers téléversés (qui ont une CSP « default-src 'none'; sandbox »).
    { source: '/:path((?!api/uploads/).*)', headers: [{ key: 'Content-Security-Policy', value: contentSecurityPolicy(opts.dev) }] },
  ];
}
