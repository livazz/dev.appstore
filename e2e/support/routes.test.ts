import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listAppRoutes, missingRoutes, patternMatches, routeExists } from './routes';

describe('patternMatches', () => {
  it('segments statiques et dynamiques', () => {
    expect(patternMatches('/games/[slug]', '/games/[slug]')).toBe(true);
    expect(patternMatches('/games/[slug]', '/games/[id]')).toBe(true);
    expect(patternMatches('/games/[slug]', '/games/crystal-clash')).toBe(true);
    expect(patternMatches('/games/[slug]', '/games/crystal-clash/link')).toBe(false);
    expect(patternMatches('/games/[slug]/link', '/games/[slug]')).toBe(false);
    expect(patternMatches('/', '/')).toBe(true);
    expect(patternMatches('/search', '/search?q=crystal')).toBe(true);
  });

  it('catch-all', () => {
    expect(patternMatches('/api/auth/[...all]', '/api/auth/sign-in/email')).toBe(true);
    expect(patternMatches('/api/auth/[...all]', '/api/auth')).toBe(false);
    expect(patternMatches('/docs/[[...p]]', '/docs')).toBe(true);
  });
});

describe('listAppRoutes / routeExists', () => {
  let app: string;
  const file = (rel: string, content = 'export default function P() { return null; }') => {
    const full = join(app, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  };

  beforeAll(() => {
    app = mkdtempSync(join(tmpdir(), 'wolleen-e2e-routes-'));
    file('page.tsx');
    file('(player)/games/[slug]/page.tsx');
    file('(player)/games/[slug]/link/page.tsx');
    file('(player)/games/[slug]/link/_parts/page.tsx'); // dossier privé : ignoré
    file('api/v1/link-codes/route.ts', 'export async function POST(req: Request) { return new Response(); }');
    file('api/v1/deliveries/[id]/ack/route.ts', 'export const POST = () => new Response();');
    file('api/auth/[...all]/route.ts', 'export const { GET, POST } = handler;');
  });
  afterAll(() => rmSync(app, { recursive: true, force: true }));

  it('retire les groupes et ignore les dossiers privés', () => {
    const patterns = listAppRoutes(app).map((r) => r.pattern).sort();
    expect(patterns).toEqual(['/', '/api/auth/[...all]', '/api/v1/deliveries/[id]/ack', '/api/v1/link-codes', '/games/[slug]', '/games/[slug]/link']);
  });

  it('vérifie la méthode exportée par un route handler', () => {
    const routes = listAppRoutes(app);
    expect(routeExists('POST /api/v1/link-codes', routes)).toBe(true);
    expect(routeExists('GET /api/v1/link-codes', routes)).toBe(false);
    expect(routeExists('POST /api/v1/deliveries/[id]/ack', routes)).toBe(true);
    expect(routeExists('POST /api/auth/sign-up/email', routes)).toBe(true);
    expect(routeExists('/games/[slug]/link', routes)).toBe(true);
  });

  it('liste les routes manquantes', () => {
    expect(missingRoutes(['/games/[slug]', '/checkout/mock', 'GET /api/v1/deliveries'], listAppRoutes(app))).toEqual([
      '/checkout/mock',
      'GET /api/v1/deliveries',
    ]);
  });

  it('dossier app absent : aucune route', () => {
    expect(listAppRoutes(join(app, 'nope'))).toEqual([]);
  });
});
