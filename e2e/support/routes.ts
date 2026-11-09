/*
 * Détection des routes présentes dans apps/web/src/app (App Router).
 *
 * Les specs e2e couvrent des modules livrés en parallèle (auth, catalogue, liaison, paiements…). Tant qu'un module
 * n'est pas fusionné, sa route n'existe pas : on marque alors la spec `test.fixme` au lieu de la laisser échouer.
 * Dès la fusion, la route apparaît et la spec s'active toute seule — rien à modifier.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { WEB_APP_DIR } from './env';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface AppRoute {
  /** Motif d'URL, groupes `(x)` et slots `@x` retirés, ex. `/games/[slug]/link`. */
  pattern: string;
  kind: 'page' | 'route';
  /** Fichier source (page.tsx ou route.ts). */
  file: string;
}

const PAGE_RE = /^page\.(tsx|ts|jsx|js|mdx)$/;
const ROUTE_RE = /^route\.(ts|js)$/;

/** Liste les pages et route handlers d'un dossier `app/` Next.js. */
export function listAppRoutes(appDir: string = WEB_APP_DIR): AppRoute[] {
  const out: AppRoute[] = [];
  if (!existsSync(appDir)) return out;
  const walk = (dir: string, segments: string[]) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name.startsWith('_') || name === 'node_modules') continue; // dossiers privés
        const isGroup = /^\(.*\)$/.test(name) && !/^\(\.{1,3}\)/.test(name);
        const isSlot = name.startsWith('@');
        walk(full, isGroup || isSlot ? segments : [...segments, name]);
      } else if (PAGE_RE.test(name) || ROUTE_RE.test(name)) {
        out.push({ pattern: '/' + segments.join('/'), kind: PAGE_RE.test(name) ? 'page' : 'route', file: full });
      }
    }
  };
  walk(appDir, []);
  return out;
}

const split = (p: string) => p.split('?')[0]!.split('/').filter(Boolean);
const isDynamic = (s: string) => /^\[[^.].*\]$/.test(s);
const isCatchAll = (s: string) => /^\[\[?\.\.\..+\]\]?$/.test(s);
const isOptionalCatchAll = (s: string) => /^\[\[\.\.\..+\]\]$/.test(s);

/**
 * Le motif d'une route de l'app correspond-il au chemin demandé ?
 * Le chemin peut être concret (`/games/crystal-clash`) ou un motif (`/games/[slug]`) : un segment dynamique
 * correspond à n'importe quel segment (le nom du paramètre n'a pas d'importance), un catch-all au reste du chemin.
 */
export function patternMatches(routePattern: string, wanted: string): boolean {
  const r = split(routePattern);
  const w = split(wanted);
  for (let i = 0; i < r.length; i++) {
    const seg = r[i]!;
    if (isCatchAll(seg)) return isOptionalCatchAll(seg) ? w.length >= i : w.length > i;
    const target = w[i];
    if (target === undefined) return false;
    if (isDynamic(seg)) continue;
    if (seg !== target) return false;
  }
  return r.length === w.length;
}

/** Le route handler exporte-t-il cette méthode HTTP ? */
export function exportsMethod(file: string, method: HttpMethod): boolean {
  const src = readFileSync(file, 'utf8');
  const decl = new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b`);
  // `export { GET, POST }`, `export const { GET, POST } = handler(…)`
  const list = new RegExp(`export\\s+(const\\s+|let\\s+)?\\{[^}]*\\b${method}\\b[^}]*\\}|export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`);
  return decl.test(src) || list.test(src);
}

/**
 * Une route demandée existe-t-elle ?
 * - `'/games/[slug]/link'` : une page (ou un route handler) répond à ce chemin ;
 * - `'POST /api/v1/link-codes'` : un route handler répond à ce chemin et exporte POST.
 */
export function routeExists(spec: string, routes: AppRoute[] = listAppRoutes()): boolean {
  const m = /^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)$/.exec(spec.trim());
  const method = m?.[1] as HttpMethod | undefined;
  const path = m ? m[2]! : spec.trim();
  return routes.some((r) => {
    if (!patternMatches(r.pattern, path)) return false;
    if (!method) return true;
    return r.kind === 'route' && exportsMethod(r.file, method);
  });
}

/** Routes demandées absentes du worktree courant. */
export function missingRoutes(specs: readonly string[], routes: AppRoute[] = listAppRoutes()): string[] {
  return specs.filter((s) => !routeExists(s, routes));
}

/** Motif de description pour test.fixme. */
export function fixmeReason(missing: readonly string[]): string {
  return `Route(s) absente(s) de ce worktree, module pas encore fusionné : ${missing.join(', ')}`;
}
