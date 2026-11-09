/** Outils de test partagés : faux `fetch` routé par chemin, enregistrement des appels. */
import type { FetchLike } from './types';

export interface RecordedCall {
  url: URL;
  init?: RequestInit;
}

export type Route = (url: URL, init?: RequestInit) => unknown | Response | Promise<unknown | Response>;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

/**
 * Faux `fetch` : `routes` associe `MÉTHODE /chemin` (ou `/chemin`) à une réponse.
 * Une route qui retourne un objet non-Response est sérialisée en JSON 200. Route inconnue → 404.
 */
export function fakeFetch(routes: Record<string, Route>): FetchLike & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const f = async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push({ url, init });
    const method = (init?.method ?? 'GET').toUpperCase();
    const route = routes[`${method} ${url.pathname}`] ?? routes[url.pathname];
    if (!route) return json({ errors: [{ status: '404', code: 'NOT_FOUND', detail: `${method} ${url.pathname}` }] }, 404);
    const out = await route(url, init);
    return out instanceof Response ? out : json(out);
  };
  return Object.assign(f, { calls });
}
