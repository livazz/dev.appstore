import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import { contentSecurityPolicy, securityHeaders } from './security-headers';

/* Revue de sécurité (CHK-HDR-01) : en-têtes globaux de next.config.ts. */

const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

describe('Content-Security-Policy', () => {
  it('production : stricte, sans eval, anti-clickjacking, formulaires vers le site et Stripe', () => {
    const csp = contentSecurityPolicy(false);
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(csp, 'script-src')).not.toContain('unsafe-eval');
    expect(directive(csp, 'script-src')).not.toMatch(/https?:|\*/); // aucune origine de script externe
    expect(directive(csp, 'form-action')).toBe("form-action 'self' https://checkout.stripe.com https://connect.stripe.com");
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('compatible avec les visuels de démo en data: (et sans http: en clair)', () => {
    const img = directive(contentSecurityPolicy(false), 'img-src');
    expect(img).toContain('data:');
    expect(img).not.toMatch(/http:|\*/);
  });

  it('développement : eval et websocket HMR autorisés, pas d’upgrade-insecure-requests', () => {
    const csp = contentSecurityPolicy(true);
    expect(directive(csp, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(csp, 'connect-src')).toContain('ws:');
    expect(csp).not.toContain('upgrade-insecure-requests');
  });
});

describe('next.config.ts headers()', () => {
  it('applique les en-têtes globaux à toutes les routes', async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === '/:path*');
    const byKey = Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]));
    expect(byKey['X-Frame-Options']).toBe('DENY');
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(byKey['Permissions-Policy']).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/);
    expect(rules.some((r) => r.headers.some((h) => h.key === 'Content-Security-Policy'))).toBe(true);
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('HSTS seulement en production', () => {
    const has = (dev: boolean) => securityHeaders({ dev }).some((r) => r.headers.some((h) => h.key === 'Strict-Transport-Security'));
    expect(has(false)).toBe(true);
    expect(has(true)).toBe(false);
  });

  it('la CSP globale exclut /api/uploads/* (qui garde sa CSP sandbox)', () => {
    const rule = securityHeaders({ dev: false }).find((r) => r.headers.some((h) => h.key === 'Content-Security-Policy'))!;
    const re = new RegExp(`^${rule.source.replace('/:path', '/')}$`);
    expect(re.test('/')).toBe(true);
    expect(re.test('/games/crystal-clash')).toBe(true);
    expect(re.test('/studio/games/gam_crystal')).toBe(true);
    expect(re.test('/api/uploads/item/usr_x/a.webp')).toBe(false);
  });
});
