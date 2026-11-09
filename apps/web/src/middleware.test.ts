import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { config, middleware } from './middleware';

/* Vague 6 : CSP à nonce par requête. */

const run = (path: string) => middleware(new NextRequest(new URL(path, 'http://localhost:3063')));
const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];

describe('middleware CSP', () => {
  it('pose une CSP à nonce dans la réponse et la transmet à Next.js dans la requête', () => {
    const res = run('/games/crystal-clash');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).not.toContain("'unsafe-inline' 'nonce"); // pas d'unsafe-inline dans script-src
    const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src '))!;
    expect(scriptSrc).not.toContain('unsafe-inline');
    const nonce = nonceOf(csp);
    expect(nonce).toBeTruthy();
    // NextResponse.next({ request: { headers } }) : en-têtes de requête réécrits, transmis via x-middleware-override-headers.
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
  });

  it('un nonce différent à chaque requête', () => {
    const a = nonceOf(run('/').headers.get('content-security-policy') ?? '');
    const b = nonceOf(run('/').headers.get('content-security-policy') ?? '');
    expect(a).not.toBe(b);
  });

  it('matcher : pages couvertes ; API, statiques et métadonnées exclues', () => {
    const re = new RegExp(`^${config.matcher[0]}$`);
    for (const p of ['/', '/games/crystal-clash', '/login', '/studio', '/studio/games/gam_crystal', '/admin', '/docs/api', '/legal/cgv', '/checkout/mock', '/pour-les-studios']) {
      expect(re.test(p), p).toBe(true);
    }
    for (const p of ['/api/v1/deliveries', '/api/uploads/item/a.webp', '/_next/static/chunks/main.js', '/favicon.ico', '/icon.svg', '/apple-icon', '/opengraph-image', '/manifest.webmanifest', '/robots.txt', '/sitemap.xml', '/icon-512.png']) {
      expect(re.test(p), p).toBe(false);
    }
  });
});
