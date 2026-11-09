import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import { API_CONTENT_SECURITY_POLICY, contentSecurityPolicy, generateNonce, securityHeaders } from './security-headers';

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

  it('avec nonce : script-src sans unsafe-inline, nonce + strict-dynamic', () => {
    const script = directive(contentSecurityPolicy(false, 'abc123=='), 'script-src');
    expect(script).toBe("script-src 'self' 'nonce-abc123==' 'strict-dynamic'");
    expect(script).not.toContain('unsafe-inline');
    // style-src garde unsafe-inline (attributs style React) : documenté dans security-headers.ts.
    expect(directive(contentSecurityPolicy(false, 'x'), 'style-src')).toBe("style-src 'self' 'unsafe-inline'");
  });

  it('nonce : base64 de 16 octets, différent à chaque appel', () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(new Set(Array.from({ length: 50 }, generateNonce)).size).toBe(50);
  });

  it('compatible avec les visuels de démo en data: (et sans http: en clair)', () => {
    const img = directive(contentSecurityPolicy(false), 'img-src');
    expect(img).toContain('data:');
    expect(img).not.toMatch(/http:|\*/);
  });

  it('C-05 (revue 2026-11) : img-src sans https: générique, seule l’origine S3 exacte est ajoutée', () => {
    expect(directive(contentSecurityPolicy(false), 'img-src')).toBe("img-src 'self' data: blob:");
    expect(directive(contentSecurityPolicy(false, 'n', ['https://cdn.devappstore.test']), 'img-src')).toBe(
      "img-src 'self' data: blob: https://cdn.devappstore.test",
    );
    // Valeurs hors origine https exacte ignorées (pas de joker, de schéma, de chemin ni d'injection de directive).
    for (const o of ['https:', '*', 'http://cdn.test', 'https://cdn.test/x', "https://cdn.test; script-src 'unsafe-inline'"]) {
      expect(directive(contentSecurityPolicy(false, 'n', [o]), 'img-src'), o).toBe("img-src 'self' data: blob:");
    }
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

  it('CSP minimale sur /api/* sauf /api/uploads/* (qui garde sa CSP sandbox) ; les pages relèvent du middleware', () => {
    const rule = securityHeaders({ dev: false }).find((r) => r.headers.some((h) => h.key === 'Content-Security-Policy'))!;
    expect(rule.headers[0]!.value).toBe(API_CONTENT_SECURITY_POLICY);
    const re = new RegExp(`^${rule.source.replace('/:path', '/')}$`);
    expect(re.test('/api/v1/deliveries')).toBe(true);
    expect(re.test('/api/auth/sign-in/email')).toBe(true);
    expect(re.test('/api/uploads/item/usr_x/a.webp')).toBe(false);
    expect(re.test('/')).toBe(false);
  });
});
